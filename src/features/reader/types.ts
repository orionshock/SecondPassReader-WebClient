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

// Local client annotation type (NOT canonical; server canonical form is W3C Web Annotation JSON-LD).
export type LocalHighlight = {
  id: string;
  cfiRange: string;
  text: string;
  note?: string;
  color?: string;
  createdAt: string;
  serverAnnotationId?: string;
  serverSavedAt?: string;
  serverSaveStatus?: "unsaved" | "saving" | "saved" | "error";
  serverSaveError?: string;
  serverDeleteStatus?: "deleting" | "error";
  serverDeleteError?: string;
};

export type PendingSelection = {
  cfiRange: string;
  text: string;
  createdAt: string;
};
