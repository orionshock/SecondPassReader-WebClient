import type { BookDetail } from "@secondpass/client";
import {
  classifyOfflinePublicationAssetAvailability,
  normalizePublicationFormat,
} from "../../../app/offline/publication/OfflinePublicationAsset.Policy";
import type { OfflinePublicationAssetCompleteRecord } from "../../../app/offline/storage/OfflineRepositories.Types";

const CURRENT_READER_FORMAT = "epub";

export type OfflineLibraryBook = {
  key: string;
  bookId: string;
  title: string;
  titleAvailable: boolean;
  format: string;
  assetBytes: number;
  admission: "available" | "unsupported-format" | "unavailable";
};

export function buildOfflineLibraryBooks(input: {
  assets: OfflinePublicationAssetCompleteRecord<Blob>[];
  metadata: ReadonlyMap<string, BookDetail | null>;
}): OfflineLibraryBook[] {
  return input.assets
    .map((asset) => presentAsset(asset, input.metadata.get(asset.bookId) ?? null))
    .sort(compareOfflineLibraryBooks);
}

export function searchOfflineLibraryBooks(
  books: readonly OfflineLibraryBook[],
  query: string,
): OfflineLibraryBook[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [...books];
  return books.filter((book) => normalizeSearchText(book.title).includes(normalizedQuery));
}

function presentAsset(
  asset: OfflinePublicationAssetCompleteRecord<Blob>,
  book: BookDetail | null,
): OfflineLibraryBook {
  const format = normalizePublicationFormat(asset.format) ?? "unknown";
  const availability = book
    ? classifyOfflinePublicationAssetAvailability({ fileMetadata: book.file, assetRecord: asset })
    : null;
  const completePayload = asset.payload instanceof Blob && asset.payload.size === asset.byteLength;
  const admission = format !== CURRENT_READER_FORMAT
    ? "unsupported-format"
    : availability?.status === "available" && completePayload
      ? "available"
      : "unavailable";
  const title = book?.title?.trim();

  return {
    key: `${asset.bookId}:${format}`,
    bookId: asset.bookId,
    title: title || fallbackBookTitle(asset.bookId),
    titleAvailable: Boolean(title),
    format,
    assetBytes: asset.byteLength,
    admission,
  };
}

function compareOfflineLibraryBooks(left: OfflineLibraryBook, right: OfflineLibraryBook): number {
  const titleOrder = left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
  return titleOrder || left.bookId.localeCompare(right.bookId) || left.format.localeCompare(right.format);
}

function normalizeSearchText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function fallbackBookTitle(bookId: string): string {
  const normalized = bookId.trim();
  const shortId = normalized.length > 12 ? `${normalized.slice(0, 8)}...` : normalized;
  return `Book ${shortId || "unknown"}`;
}
