import type { LibraryBook } from "@secondpass/client";

export function formatBookAuthors(book: Pick<LibraryBook, "authors">): string {
  return (book.authors ?? []).map((a) => a.name).filter(Boolean).join(", ");
}

export function formatBookSeries(book: Pick<LibraryBook, "series" | "series_index">): string | null {
  return book.series?.name && book.series_index != null ? `${book.series.name} #${book.series_index}` : book.series?.name ?? null;
}

export function formatFileSize(bytes?: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export function getBookMetaItems(book: LibraryBook): Array<string | null> {
  return [book.language || null, book.published_date || null, formatFileSize(book.file?.file_size ?? null)];
}
