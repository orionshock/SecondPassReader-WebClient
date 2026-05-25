import type { LibraryBook, ReadingOpenResponse } from "@secondpass/client";
import type { HighlightColor } from "./highlightColors";

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
  color?: HighlightColor;
  readOnly?: boolean;
  sourceSessionId?: string;
  sourceSessionLabel?: string;
  createdAt: string;
  createIdempotencyKey?: string;
  serverAnnotationId?: string;
  serverSavedAt?: string;
  serverSaveStatus?: "unsaved" | "saving" | "saved" | "error";
  serverSaveError?: string;
  serverDeleteStatus?: "deleting" | "error";
  serverDeleteError?: string;
  serverUpdateStatus?: "editing" | "saving" | "saved" | "error";
  serverUpdateError?: string;
  serverUpdatedAt?: string;
};

export type PendingSelection = {
  cfiRange: string;
  text: string;
  createdAt: string;
  // Optional viewport-relative anchor point for contextual UI (e.g. selection toolbar).
  // Numbers are in CSS pixels in the top-level window coordinate space.
  anchor?: { x: number; y: number };
};
