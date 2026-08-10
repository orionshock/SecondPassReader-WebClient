import type { BookDetail, CompactBook } from "@secondpass/client";

export function formatBookAuthors(book: Pick<CompactBook | BookDetail, "authors">): string {
  return (book.authors ?? []).map((a) => a.name).filter(Boolean).join(", ");
}

export function formatBookSeries(book: Pick<CompactBook | BookDetail, "series">): string | null {
  return book.series?.name && book.series.seriesIndex != null ? `${book.series.name} #${book.series.seriesIndex}` : book.series?.name ?? null;
}

export function formatBookPublishedDate(book: Pick<CompactBook | BookDetail, "publishedYear" | "publishedMonth" | "publishedDay">): string | null {
  if (book.publishedYear == null) return null;
  return [book.publishedYear, book.publishedMonth?.toString().padStart(2, "0"), book.publishedDay?.toString().padStart(2, "0")]
    .filter(Boolean)
    .join("-");
}

export function getBookMetaItems(book: CompactBook): Array<string | null> {
  return [book.language || null, formatBookPublishedDate(book), book.fileFormat || null];
}
