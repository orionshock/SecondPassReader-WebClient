import type { LibraryBook } from "../../schemas/library";

export type OpenedBook = {
  book: LibraryBook;
  blob: Blob;
  objectUrl: string;
  openedAt: string;
};

// Local-only spike type (NOT canonical; will be replaced by W3C Web Annotation JSON-LD from server).
export type LocalHighlight = {
  id: string;
  cfiRange: string;
  text: string;
  color?: string;
  createdAt: string;
};
