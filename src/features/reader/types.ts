import type { LibraryBook, ReadingOpenResponse } from "@secondpass/client";

export type OpenedBook = {
  book: LibraryBook;
  blob: Blob;
  objectUrl: string;
  openedAt: string;
  readingOpen?: ReadingOpenResponse;
};

