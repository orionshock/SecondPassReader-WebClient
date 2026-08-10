import type { MarginaliaAnnotation } from "@secondpass/client";
import { toReaderAnnotation } from "../annotations/annotationUtils";
import type { ReaderAnnotation, ReaderHighlightMark, ReaderLocation, ReaderTocItem } from "../domain/types";
import type { DurableAnnotationToolbarItem } from "../shell/ReaderDurableAnnotationToolbar.Toolbar";
import type { ReadingSessionState } from "./types";

export function buildReadingSessionState(input: {
  bookId: string | number;
  sessionId: string | null;
  location: ReaderLocation | null;
  toc: ReaderTocItem[] | null;
  annotations: MarginaliaAnnotation[];
}): ReadingSessionState {
  const annotations = input.annotations
    .map((annotation) => toReaderAnnotation(annotation))
    .filter((annotation): annotation is ReaderAnnotation => Boolean(annotation));
  return {
    bookId: input.bookId,
    sessionId: input.sessionId,
    location: input.location,
    toc: input.toc,
    annotations,
  };
}

export function composeReadingSessionDurableMarks(
  currentSessionMarks: ReaderHighlightMark[],
  previousSessionMarks: ReaderHighlightMark[],
): ReaderHighlightMark[] {
  return [...currentSessionMarks, ...previousSessionMarks];
}

export function buildReadingSessionAnnotationToolbarItems(
  marks: ReaderHighlightMark[],
): DurableAnnotationToolbarItem[] {
  return marks
    .filter((mark) => Boolean(mark.id && mark.cfiRange))
    .map((mark) => ({
      id: mark.id,
      mode: mark.readOnly ? "readonly" : "editable",
      quoteText: mark.text,
      note: mark.note,
      color: mark.color,
    }));
}
