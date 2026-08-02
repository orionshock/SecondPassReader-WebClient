import type { CompactBook } from "@secondpass/client";

function parseSeriesIndex(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function findNextBookInSeries(currentBook: CompactBook, seriesBooks: CompactBook[]): CompactBook | null {
  const seriesId = currentBook.series?.id ?? null;
  if (!seriesId) return null;

  const currentIndex = parseSeriesIndex(currentBook.series?.seriesIndex);
  const candidates = seriesBooks.filter((b) => String(b.series?.id ?? "") === String(seriesId));

  if (currentIndex != null) {
    let next: { book: CompactBook; idx: number } | null = null;
    for (const book of candidates) {
      const idx = parseSeriesIndex(book.series?.seriesIndex);
      if (idx != null && idx > currentIndex && (!next || idx < next.idx)) next = { book, idx };
    }
    return next?.book ?? null;
  }

  // Fallback: preserve server list order if series_index isn't parseable.
  const idxInList = candidates.findIndex((b) => String(b.id) === String(currentBook.id));
  if (idxInList < 0) return candidates.find((b) => String(b.id) !== String(currentBook.id)) ?? null;
  for (let i = idxInList + 1; i < candidates.length; i += 1) {
    if (candidates[i]) return candidates[i];
  }
  return null;
}
