import type { LibraryBook } from "../../schemas/library";
import type { ReadingOpenResponse } from "../../schemas/readingSession";

export type ReaderLocation = {
  cfi?: string;
  href?: string;
  progression?: number;
  displayedPage?: number;
  displayedTotal?: number;
  raw?: unknown;
};

export type OpenedBook = {
  book: LibraryBook;
  blob: Blob;
  objectUrl: string;
  openedAt: string;
  readingOpen?: ReadingOpenResponse;
};

// Local-only spike type (NOT canonical; will be replaced by W3C Web Annotation JSON-LD from server).
export type LocalHighlight = {
  id: string;
  cfiRange: string;
  text: string;
  note?: string;
  color?: string;
  createdAt: string;
};

export type PendingSelection = {
  cfiRange: string;
  text: string;
  createdAt: string;
};
