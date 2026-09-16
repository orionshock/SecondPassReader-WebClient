import type { BookDetail } from "@secondpass/client";
import {
  buildOfflineSavedPublications,
  type OfflineSavedPublication,
} from "../../../app/offline/publication/OfflineSavedPublication.Queries";
import type {
  OfflinePublicationAssetCompleteRecord,
  OfflinePublicationCoverRecord,
} from "../../../app/offline/storage/OfflineRepositories.Types";
export type OfflineLibraryBook = OfflineSavedPublication;

export function buildOfflineLibraryBooks(input: {
  assets: OfflinePublicationAssetCompleteRecord<Blob>[];
  metadata: ReadonlyMap<string, BookDetail | null>;
  covers?: ReadonlyMap<string, OfflinePublicationCoverRecord<Blob> | null>;
}): OfflineLibraryBook[] {
  return buildOfflineSavedPublications(input).sort(compareOfflineLibraryBooks);
}

export function searchOfflineLibraryBooks(
  books: readonly OfflineLibraryBook[],
  query: string,
): OfflineLibraryBook[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [...books];
  return books.filter((book) => normalizeSearchText(book.title).includes(normalizedQuery));
}

function compareOfflineLibraryBooks(left: OfflineLibraryBook, right: OfflineLibraryBook): number {
  const titleOrder = left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
  return titleOrder || left.bookId.localeCompare(right.bookId) || left.format.localeCompare(right.format);
}

function normalizeSearchText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
