import type { ReadingAnnotation } from "@secondpass/client";
import type { ReaderAnnotation } from "../domain/types";
import type { ReaderLocationDescription, ReaderTocItem } from "../domain/types";
import { toReaderCfiLocationDisplay } from "../session/readerCfiDescriptions";
import { getAnnotationFragmentCfi, isBookmarkAnnotation } from "./annotationSelectors";

export type ReaderBookmark = Extract<ReaderAnnotation, { kind: "bookmark" }>;
export type ReaderBookmarkViewModel = {
  id: string;
  cfi: string;
  href?: string;
  label: string;
  labelParts: string[];
  timestamp?: string;
  isCurrent: boolean;
  descriptionStatus: "idle" | "loading" | "ready" | "error";
};

export function toReaderBookmark(annotation: ReadingAnnotation): ReaderBookmark | null {
  if (!isBookmarkAnnotation(annotation)) return null;
  const cfi = getAnnotationFragmentCfi(annotation);
  if (!cfi) return null;
  return { kind: "bookmark", id: annotation.id, cfi };
}

export function toBookmarkViewModel(input: {
  bookmark: ReaderBookmark;
  currentCfi?: string | null;
  toc?: ReaderTocItem[] | null;
  bookTitle?: string | null;
  description?: ReaderLocationDescription | null;
  fallbackBookProgress?: number | null | undefined;
  timestamp?: string | null;
  descriptionStatus: "idle" | "loading" | "ready" | "error";
}): ReaderBookmarkViewModel {
  const isCurrent = Boolean(input.currentCfi && input.bookmark.cfi === input.currentCfi);
  const description = input.description
    ? {
        ...input.description,
        bookProgress: input.description.bookProgress ?? (isCurrent ? input.fallbackBookProgress : null),
      }
    : isCurrent && typeof input.fallbackBookProgress === "number"
      ? { cfi: input.bookmark.cfi, bookProgress: input.fallbackBookProgress }
      : null;
  const locationDisplay = toReaderCfiLocationDisplay({
    description,
    toc: input.toc,
    bookTitle: input.bookTitle,
  });
  return {
    id: input.bookmark.id,
    cfi: input.bookmark.cfi,
    href: description?.href,
    label: locationDisplay.label,
    labelParts: locationDisplay.labelParts,
    timestamp: input.timestamp ?? undefined,
    isCurrent,
    descriptionStatus: input.descriptionStatus,
  };
}
