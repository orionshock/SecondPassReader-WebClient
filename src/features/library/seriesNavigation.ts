import type { LibraryBook } from "../../schemas/library";

function parseSeriesIndex(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function findNextBookInSeries(currentBook: LibraryBook, seriesBooks: LibraryBook[]): LibraryBook | null {
  const seriesId = currentBook.series?.id ?? null;
  if (!seriesId) return null;

  const currentIndex = parseSeriesIndex(currentBook.series_index);
  const candidates = seriesBooks.filter((b) => String(b.series?.id ?? "") === String(seriesId));

  if (currentIndex != null) {
    const withIndex = candidates
      .map((b) => ({ book: b, idx: parseSeriesIndex(b.series_index) }))
      .filter((x): x is { book: LibraryBook; idx: number } => x.idx != null)
      .sort((a, b) => a.idx - b.idx);

    const nextHigher = withIndex.filter((x) => x.idx > currentIndex);
    if (nextHigher.length === 0) return null;

    const withFiles = nextHigher.find((x) => Boolean(x.book.file?.download_url));
    return (withFiles ?? nextHigher[0]).book;
  }

  // Fallback: use list order and current id if series_index isn't parseable.
  const idxInList = candidates.findIndex((b) => String(b.id) === String(currentBook.id));
  if (idxInList < 0) return candidates.find((b) => String(b.id) !== String(currentBook.id)) ?? null;
  for (let i = idxInList + 1; i < candidates.length; i += 1) {
    if (candidates[i]) return candidates[i];
  }
  return null;
}

