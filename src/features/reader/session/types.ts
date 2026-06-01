import type { ReaderAnnotation, ReaderLocation, ReaderTocItem } from "../domain/types";

export type ReadingSessionState = {
  bookId: string | number;
  sessionId: string | null;
  location: ReaderLocation | null;
  toc: ReaderTocItem[] | null;
  annotations: ReaderAnnotation[];
};
