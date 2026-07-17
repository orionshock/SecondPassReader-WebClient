export type Book = {
  id: string;
  title: string;
  authors?: string[];
  language?: string | null;
  coverImageUrl?: string | null;
};

export type BookFile = {
  bookId: string;
  mimeType: "application/epub+zip" | string;
  url: string;
};

export type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type PreviewBook = {
  id: string;
  title: string;
  cover_url: string | null;
};

export type LibraryAuthorSummary = {
  id: string | number;
  name: string;
};

export type LibrarySeriesSummary = {
  id: string | number;
  name: string;
  sort_name: string;
  series_index: number | string | null;
};

export type LibraryTag = {
  id: string | number;
  name: string;
  slug: string;
  book_count: number;
};

export type LibraryTagSummary = Omit<LibraryTag, "book_count">;

export type LibraryBookIdentifier = {
  id: string | number;
  scheme: string;
  value: string;
};

export type LibraryBookFile = {
  format: string;
  file_size: number;
  checksum: string;
  download_url: string;
};

export type LibraryBook = {
  id: string | number;
  title: string;
  sort_title: string;
  subtitle: string | null;
  authors: LibraryAuthorSummary[];
  series: LibrarySeriesSummary | null;
  tags: LibraryTagSummary[];
  language: string | null;
  publisher: string | null;
  published_year: number | null;
  published_month: number | null;
  published_day: number | null;
  published_date_precision: string | null;
  cover_url: string | null;
  file_format: string | null;
  /** @deprecated Compatibility with older servers; use series.series_index. */
  series_index?: number | string | null;
  /** @deprecated Compatibility with older servers; detail descriptions use description. */
  summary?: string | null;
  /** @deprecated Compatibility with older servers; use the precision date fields. */
  published_date?: string | null;
  description?: string | null;
  identifiers?: LibraryBookIdentifier[];
  catalog_tags?: LibraryTagSummary[];
  file?: LibraryBookFile | null;
};

export type LibrarySeries = {
  id: string | number;
  name: string;
  sort_name: string;
  summary: string | null;
  book_count: number;
  preview_books?: PreviewBook[];
};

export type LibraryAuthor = {
  id: string | number;
  name: string;
  sort_name: string;
  biography: string | null;
  book_count: number;
  preview_books?: PreviewBook[];
};

export type LibraryGroup = {
  id: string | number;
  name: string;
  description: string | null;
  is_public_group: boolean;
  /** @deprecated Not part of the rebuilt catalog group payload. */
  is_curator?: boolean;
  /** @deprecated Not part of the rebuilt catalog group payload. */
  book_count?: number | null;
  preview_books?: PreviewBook[];
};

export type BookFileDownloadResult = {
  blob: Blob;
  contentType?: string;
  contentLength?: number;
  contentDisposition?: string;
  filename?: string;
};
