import type { ReaderAnnotation, ReaderLocation, ReaderSelection, ReaderTocItem } from "../shell/types";

export type ReadingSessionState = {
  bookId: string | number;
  sessionId: string | null;
  location: ReaderLocation | null;
  selection: ReaderSelection | null;
  toc: ReaderTocItem[] | null;
  annotations: ReaderAnnotation[];
};
