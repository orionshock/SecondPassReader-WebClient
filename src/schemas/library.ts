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
  // Some servers may provide a direct blob/arrayBuffer later; keep URL-first for now.
};

export type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type LibraryAuthorSummary = {
  id: string | number;
  name: string;
};

export type LibrarySeriesSummary = {
  id: string | number;
  name: string;
};

export type LibraryGroupSummary = {
  id: string | number;
  name: string;
};

export type LibraryBookFileSummary = {
  id: string | number;
  format?: string | null;
  file_size?: number | null;
  download_url?: string | null;
  checksum_short?: string | null;
};

export type LibraryBook = {
  id: string | number;
  title: string;
  subtitle?: string | null;
  summary?: string | null;
  description?: string | null;
  publisher?: string | null;
  language?: string | null;
  published_date?: string | null;
  isbn?: string | null;
  cover_url?: string | null;
  subjects?: string[] | null;
  authors?: LibraryAuthorSummary[] | null;
  series?: LibrarySeriesSummary | null;
  series_index?: number | string | null;
  identifiers?: unknown;
  groups?: LibraryGroupSummary[] | null;
  file?: LibraryBookFileSummary | null;
  created_at?: string;
  updated_at?: string;
};

export type BookFileDownloadResult = {
  blob: Blob;
  contentType?: string;
  contentLength?: number;
  contentDisposition?: string;
  filename?: string;
};
