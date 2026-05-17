import type { LibraryBook } from "../../schemas/library";

export type OpenedBook = {
  book: LibraryBook;
  blob: Blob;
  objectUrl: string;
  openedAt: string;
};

