import type { MarginaliaAnnotation } from "@secondpass/client";
import { toReaderAnnotation } from "../annotations/ReaderAnnotation.Mapper";
import type { ReaderAnnotation, ReaderHighlightMark, ReaderLocation, ReaderTocItem } from "../domain/ReaderDomain.Types";
import type { DurableAnnotationToolbarItem } from "../shell/ReaderDurableAnnotationToolbar.UI";
import type { ReadingSessionState } from "./ReadingSession.Types";

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
  return [...currentSessionMarks, ...previousSessionMarks].filter(isRenderableHighlightMark);
}

export function buildReadingSessionAnnotationToolbarItems(
  marks: ReaderHighlightMark[],
): DurableAnnotationToolbarItem[] {
  return marks
    .filter(isRenderableHighlightMark)
    .map((mark) => ({
      id: mark.id,
      mode: mark.readOnly ? "readonly" : "editable",
      quoteText: mark.text,
      note: mark.note,
      color: mark.color,
    }));
}

function isRenderableHighlightMark(mark: ReaderHighlightMark): boolean {
  return mark.id.trim().length > 0 && mark.cfiRange.trim().length > 0;
}
