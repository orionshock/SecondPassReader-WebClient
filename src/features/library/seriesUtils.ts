import type { LibraryBook } from "@secondpass/client";

export function normalizeSeriesIndex(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function findNextSeriesBook(currentBook: LibraryBook, books: LibraryBook[]): LibraryBook | null {
  const currentIndex = normalizeSeriesIndex(currentBook.series?.series_index);
  if (currentIndex == null) return null;
  const currentId = String(currentBook.id);

  let next: { book: LibraryBook; index: number } | null = null;
  for (const book of books) {
    const index = normalizeSeriesIndex(book.series?.series_index);
    if (String(book.id) === currentId || index == null || index <= currentIndex) continue;
    if (!next || index < next.index) next = { book, index };
  }
  return next?.book ?? null;
}

export function formatSeriesIndex(value: unknown): string | null {
  const index = normalizeSeriesIndex(value);
  return index == null ? null : `${index}`;
}
