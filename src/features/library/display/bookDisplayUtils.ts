import type { LibraryBook } from "@secondpass/client";

export function formatBookAuthors(book: Pick<LibraryBook, "authors">): string {
  return (book.authors ?? []).map((a) => a.name).filter(Boolean).join(", ");
}

export function formatBookSeries(book: Pick<LibraryBook, "series">): string | null {
  return book.series?.name && book.series.series_index != null ? `${book.series.name} #${book.series.series_index}` : book.series?.name ?? null;
}

export function formatBookPublishedDate(book: Pick<LibraryBook, "published_year" | "published_month" | "published_day">): string | null {
  if (book.published_year == null) return null;
  return [book.published_year, book.published_month?.toString().padStart(2, "0"), book.published_day?.toString().padStart(2, "0")]
    .filter(Boolean)
    .join("-");
}

export function getBookMetaItems(book: LibraryBook): Array<string | null> {
  return [book.language || null, formatBookPublishedDate(book), book.file_format || null];
}
