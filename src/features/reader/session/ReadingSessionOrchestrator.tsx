import type { ReaderSettings } from "../../../storage/readerSettings";
import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ReadingShell } from "../shell/ReadingShell";
import type { ReaderAnnotation, ReaderLocationTarget, ReadingShellEvent } from "../shell/types";
import type { ReaderLocation } from "../domain/types";
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
  const [location, setLocation] = useState<ReaderLocation | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const initialDisplayTarget: ReaderLocationTarget | undefined = useMemo(() => {
    const progress = props.openedBook.readingOpen?.progress;
    const cfi =
      progress?.current_location?.cfi ??
      progress?.current_location?.selector?.value ??
      null;
    if (typeof cfi === "string" && cfi.trim()) return { type: "cfi", cfi: cfi.trim() };
    return undefined;
  }, [props.openedBook.readingOpen?.progress]);

  const state: ReadingSessionState = useMemo(() => {
    const seedAnnotations: ReaderAnnotation[] = [];
    return {
      bookId: props.openedBook.book.id,
      sessionId: props.openedBook.readingOpen?.session?.id ?? null,
      location,
      selection: null,
      toc: null,
      annotations: seedAnnotations,
    };
  }, [location, props.openedBook.book.id, props.openedBook.readingOpen?.session?.id]);

  const onShellEvent = useCallback((event: ReadingShellEvent) => {
    switch (event.type) {
      case "locationChanged":
        setLocation(event.location);
        return;
      case "displayError":
        setLastError(event.error instanceof Error ? event.error.message : "Reader error");
        return;
      case "selectionChanged":
      case "tocReady":
        // not implemented in this vertical slice
        return;
    }
  }, []);

  return props.children({
    state,
    shellProps: {
      render: () => (
        <div className="spReaderShellStack">
          <ReadingShell blob={props.openedBook.blob} initialDisplayTarget={initialDisplayTarget} annotations={state.annotations} onEvent={onShellEvent} />
          <section className="panel spReaderDebugPanel">
            <h2 className="panelTitle">Reader debug (temporary)</h2>
            <div className="muted">Session: {state.sessionId ?? "(none yet)"}</div>
            <div className="muted">Book ID: {String(state.bookId)}</div>
            {lastError ? <div className="errorText">{lastError}</div> : null}
            <div className="spReaderDebugGrid">
              <div className="muted">cfi</div>
              <div className="mono">{state.location?.cfi ?? ""}</div>
              <div className="muted">href</div>
              <div className="mono">{state.location?.href ?? ""}</div>
              <div className="muted">progression</div>
              <div className="mono">{state.location?.progression ?? ""}</div>
              <div className="muted">page</div>
              <div className="mono">
                {state.location?.displayedPage ?? ""}/{state.location?.displayedTotal ?? ""}
              </div>
            </div>
          </section>
        </div>
      ),
    },
  });
}
