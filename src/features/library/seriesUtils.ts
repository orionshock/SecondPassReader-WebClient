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
  const currentIndex = normalizeSeriesIndex(currentBook.series_index);
  if (currentIndex == null) return null;
  const currentId = String(currentBook.id);

  const candidates = books
    .map((book) => ({ book, index: normalizeSeriesIndex(book.series_index) }))
    .filter((entry): entry is { book: LibraryBook; index: number } => entry.index != null)
    .filter((entry) => String(entry.book.id) !== currentId && entry.index > currentIndex)
    .sort((a, b) => a.index - b.index);

  return candidates[0]?.book ?? null;
}

export function formatSeriesIndex(value: unknown): string | null {
  const index = normalizeSeriesIndex(value);
  return index == null ? null : `${index}`;
}
