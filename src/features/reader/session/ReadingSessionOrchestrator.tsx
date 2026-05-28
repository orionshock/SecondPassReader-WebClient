import type { ReaderSettings } from "../../../storage/readerSettings";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { ReadingShell } from "../shell/ReadingShell";
import type { ReaderAnnotation } from "../shell/types";
import type { ReadingSessionState } from "./types";
import type { OpenedBook } from "../types";

export type ReadingSessionOrchestratorProps = {
  openedBook: OpenedBook;
  apiBaseUrl?: string;
  accessToken?: string;
  tokenType?: string;
  settings?: ReaderSettings;
  children: (arg: { state: ReadingSessionState; shellProps: { render: () => ReactNode } }) => ReactNode;
};

// Placeholder orchestrator: will eventually own session state, SPL calls, and Shell cross-talk.
export function ReadingSessionOrchestrator(props: ReadingSessionOrchestratorProps) {
  const state: ReadingSessionState = useMemo(() => {
    const seedAnnotations: ReaderAnnotation[] = [];
    return {
      bookId: props.openedBook.book.id,
      sessionId: props.openedBook.readingOpen?.session?.id ?? null,
      location: null,
      selection: null,
      toc: null,
      annotations: seedAnnotations,
    };
  }, [props.openedBook.book.id, props.openedBook.readingOpen?.session?.id]);

  return props.children({
    state,
    shellProps: {
      render: () => <ReadingShell blob={props.openedBook.blob} annotations={state.annotations} />,
    },
  });
}

