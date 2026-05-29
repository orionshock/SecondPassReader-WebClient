import type { ReaderSettings } from "../../../storage/readerSettings";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ReadingShell } from "../shell/ReadingShell";
import type { ReaderAnnotation, ReaderLocationTarget, ReadingShellEvent } from "../shell/types";
import type { ReaderLocation } from "../domain/types";
import type { ReaderTocItem } from "../domain/types";
import type { ReadingSessionState } from "./types";
import type { OpenedBook } from "../types";

export type ReadingSessionOrchestratorProps = {
  openedBook: OpenedBook;
  apiBaseUrl?: string;
  accessToken?: string;
  tokenType?: string;
  settings?: ReaderSettings;
  children: (arg: {
    state: ReadingSessionState;
    shell: ReactNode;
    debugPanel: ReactNode;
    sendCommand: (command: { type: "display"; target: ReaderLocationTarget } | { type: "next" } | { type: "previous" }) => void;
  }) => ReactNode;
};

// Placeholder orchestrator: will eventually own session state, SPL calls, and Shell cross-talk.
export function ReadingSessionOrchestrator(props: ReadingSessionOrchestratorProps) {
  const [location, setLocation] = useState<ReaderLocation | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [toc, setToc] = useState<ReaderTocItem[] | null>(null);
  const [pendingCommand, setPendingCommand] = useState<{ seq: number; value: { type: "display"; target: ReaderLocationTarget } | { type: "next" } | { type: "previous" } } | null>(null);
  const commandSeqRef = useRef(0);

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
      toc,
      annotations: seedAnnotations,
    };
  }, [location, props.openedBook.book.id, props.openedBook.readingOpen?.session?.id, toc]);

  const statusLine = useMemo(() => {
    const parts: string[] = [];

    const chapterLabel = state.toc && state.location?.href ? findTocLabelForHref(state.toc, state.location.href) : null;
    if (chapterLabel) parts.push(chapterLabel);

    if (typeof state.location?.bookProgress === "number" && Number.isFinite(state.location.bookProgress)) {
      parts.push(`${Math.round(state.location.bookProgress * 100)}%`);
    }

    if (typeof state.location?.displayedPage === "number" && typeof state.location?.displayedTotal === "number") {
      parts.push(`p${state.location.displayedPage}/${state.location.displayedTotal}`);
    }

    return parts.join(" \u00B7 ");
  }, [state.location?.bookProgress, state.location?.displayedPage, state.location?.displayedTotal, state.location?.href, state.toc]);

  const onShellEvent = useCallback((event: ReadingShellEvent) => {
    switch (event.type) {
      case "locationChanged":
        setLocation(event.location);
        return;
      case "displayError":
        setLastError(event.error instanceof Error ? event.error.message : "Reader error");
        return;
      case "selectionChanged":
        // not implemented in this vertical slice
        return;
      case "tocReady":
        setToc(event.toc);
        return;
    }
  }, []);

  const sendCommand = useCallback((command: { type: "display"; target: ReaderLocationTarget } | { type: "next" } | { type: "previous" }) => {
    commandSeqRef.current += 1;
    setPendingCommand({ seq: commandSeqRef.current, value: command });
  }, []);

  // Restore saved location via the same command path used for future navigation.
  // Best-effort: this command may be deferred by the shell until the engine exists.
  const lastRestoreKeyRef = useRef<string>("");
  useEffect(() => {
    if (!initialDisplayTarget) return;
    const key = `${props.openedBook.objectUrl}|${JSON.stringify(initialDisplayTarget)}`;
    if (lastRestoreKeyRef.current === key) return;
    lastRestoreKeyRef.current = key;
    sendCommand({ type: "display", target: initialDisplayTarget });
  }, [initialDisplayTarget, props.openedBook.objectUrl, sendCommand]);

  return props.children({
    state,
    shell: (
      <ReadingShell
        blob={props.openedBook.blob}
        initialDisplayTarget={initialDisplayTarget}
        annotations={state.annotations}
        onEvent={onShellEvent}
        command={pendingCommand ?? undefined}
        statusLine={statusLine}
      />
    ),
    debugPanel: (
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
          <div className="muted">bookProgress</div>
          <div className="mono">{state.location?.bookProgress ?? ""}</div>
          <div className="muted">page</div>
          <div className="mono">
            {state.location?.displayedPage ?? ""}/{state.location?.displayedTotal ?? ""}
          </div>
        </div>
      </section>
    ),
    sendCommand,
  });
}

function normalizeHrefForCompare(href: string): string {
  const s = href.trim();
  const hashIdx = s.indexOf("#");
  return (hashIdx >= 0 ? s.slice(0, hashIdx) : s).toLowerCase();
}

function findTocLabelForHref(toc: ReaderTocItem[], href: string): string | null {
  const target = normalizeHrefForCompare(href);
  const visit = (items: ReaderTocItem[]): { label: string; score: 2 | 1 } | null => {
    let best: { label: string; score: 2 | 1 } | null = null;
    for (const item of items) {
      if (item.href) {
        const candidate = normalizeHrefForCompare(item.href);
        if (candidate === target) return { label: item.label, score: 2 };
        if (candidate && target && (candidate.endsWith(target) || target.endsWith(candidate))) {
          if (!best) best = { label: item.label, score: 1 };
        }
      }
      if (item.children && item.children.length > 0) {
        const found = visit(item.children);
        if (found?.score === 2) return found;
        if (!best && found) best = found;
      }
    }
    return best;
  };

  return visit(toc)?.label ?? null;
}
