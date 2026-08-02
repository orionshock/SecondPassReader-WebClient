import type { BookDetail, CompactBook, ReadingOpenResponse } from "@secondpass/client";

export type ReaderReturnTarget = {
  kind: "home" | "library" | "shelves" | "shelf" | "sessions" | "bookDetail" | "series";
  label: string;
  route: string;
  bookId?: string;
  shelfId?: string;
  sessionId?: string;
  seriesId?: string;
};

export type OpenedBook = {
  book: CompactBook | BookDetail;
  blob: Blob;
  objectUrl: string;
  openedAt: string;
  readingOpen?: ReadingOpenResponse;
  returnTarget: ReaderReturnTarget;
};
