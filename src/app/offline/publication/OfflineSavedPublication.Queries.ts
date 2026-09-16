import type { BookDetail } from "@secondpass/client";
import { isUsableOfflinePublicationCover } from "./OfflinePublicationCover.Policy";
import {
  classifyOfflinePublicationAssetAvailability,
  getOfflinePublicationPayloadBytes,
  hasCompleteOfflinePublicationPayload,
  normalizePublicationFormat,
} from "./OfflinePublicationAsset.Policy";
import type {
  OfflinePublicationAssetCompleteRecord,
  OfflinePublicationCoverRecord,
} from "../storage/OfflineRepositories.Types";

const CURRENT_READER_FORMAT = "epub";

export type OfflineSavedPublication = {
  key: string;
  bookId: string;
  book: BookDetail | null;
  title: string;
  titleAvailable: boolean;
  format: string;
  assetBytes: number;
  asset: OfflinePublicationAssetCompleteRecord<Blob>;
  coverBlob: Blob | null;
  admission: "available" | "unsupported-format" | "unavailable";
};

// The retained asset defines saved membership. Metadata enriches it, but never makes a Book readable alone.
export function buildOfflineSavedPublications(input: {
  assets: readonly OfflinePublicationAssetCompleteRecord<Blob>[];
  metadata: ReadonlyMap<string, BookDetail | null>;
  covers?: ReadonlyMap<string, OfflinePublicationCoverRecord<Blob> | null>;
}): OfflineSavedPublication[] {
  return input.assets.map((asset) => {
    const book = input.metadata.get(asset.bookId) ?? null;
    const format = normalizePublicationFormat(asset.format) ?? "unknown";
    const availability = book
      ? classifyOfflinePublicationAssetAvailability({ fileMetadata: book.file, assetRecord: asset })
      : null;
    const admission = format !== CURRENT_READER_FORMAT
      ? "unsupported-format"
      : availability?.status === "available" && hasCompleteOfflinePublicationPayload(asset)
        ? "available"
        : "unavailable";
    const title = offlineSavedBookTitle(asset.bookId, book?.title ?? null);
    const cover = input.covers?.get(asset.bookId) ?? null;
    return {
      key: `${asset.bookId}:${format}`,
      bookId: asset.bookId,
      book,
      title: title.text,
      titleAvailable: title.available,
      format,
      assetBytes: getOfflinePublicationPayloadBytes(asset),
      asset,
      coverBlob: isUsableOfflinePublicationCover(cover) ? cover.payload : null,
      admission,
    };
  });
}

export function selectOfflineSavedPublication(
  publications: readonly OfflineSavedPublication[],
  bookId: string,
  expectedFormat: string | null,
): OfflineSavedPublication | null {
  const candidates = publications
    .filter((publication) => publication.bookId === bookId)
    .sort((left, right) => left.format.localeCompare(right.format));
  return candidates.find((publication) => publication.format === expectedFormat) ?? candidates[0] ?? null;
}

export function offlineSavedBookTitle(bookId: string, storedTitle: string | null): {
  text: string;
  available: boolean;
} {
  const title = storedTitle?.trim();
  const normalizedBookId = bookId.trim();
  const shortId = normalizedBookId.length > 12 ? `${normalizedBookId.slice(0, 8)}...` : normalizedBookId;
  return {
    text: title || `Book ${shortId || "unknown"}`,
    available: Boolean(title),
  };
}
