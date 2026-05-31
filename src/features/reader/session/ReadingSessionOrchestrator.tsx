import type { ReaderSettings } from "../../../storage/readerSettings";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ReadingShell } from "../shell/ReadingShell";
import type { ReaderAnnotation, ReaderLocationTarget, ReadingShellEvent } from "../shell/types";
import type { ReaderLocation } from "../domain/types";
import type { ReaderTocItem } from "../domain/types";
import type { ReadingSessionState } from "./types";
import type { OpenedBook } from "../types";
import { useReadingProgressAutosave } from "./useReadingProgressAutosave";
import type { SecondPassClient } from "@secondpass/client";
import type { ReadingAnnotation } from "@secondpass/client";
import { toReaderBookmark, type ReaderBookmark } from "../annotations/bookmarkUtils";

export type ReadingSessionOrchestratorProps = {
  openedBook: OpenedBook;
  spl?: SecondPassClient | null;
  settings?: ReaderSettings;
  children: (arg: {
    state: ReadingSessionState;
    shell: ReactNode;
    debugPanel: ReactNode;
    sendCommand: (command: { type: "display"; target: ReaderLocationTarget } | { type: "next" } | { type: "previous" }) => void;
    bookmarks: {
      items: ReaderBookmark[];
      status: "idle" | "loading" | "ready" | "error";
      error: string | null;
      currentBookmarkId: string | null;
      busy: boolean;
      toggleCurrent: () => Promise<void>;
      removeById: (bookmarkId: string) => Promise<void>;
    };
  }) => ReactNode;
};

// Placeholder orchestrator: will eventually own session state, SPL calls, and Shell cross-talk.
export function ReadingSessionOrchestrator(props: ReadingSessionOrchestratorProps) {
  const [location, setLocation] = useState<ReaderLocation | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [toc, setToc] = useState<ReaderTocItem[] | null>(null);
  const [pendingCommand, setPendingCommand] = useState<{ seq: number; value: { type: "display"; target: ReaderLocationTarget } | { type: "next" } | { type: "previous" } } | null>(null);
  const commandSeqRef = useRef(0);
  const profileVersion = props.openedBook.readingOpen?.profile_version ?? null;
  const [bookmarks, setBookmarks] = useState<ReaderBookmark[]>([]);
  const [bookmarkStatus, setBookmarkStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);

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
    const seedAnnotations: ReaderAnnotation[] = bookmarks;
    return {
      bookId: props.openedBook.book.id,
      sessionId: props.openedBook.readingOpen?.session?.id ?? null,
      location,
      selection: null,
      toc,
      annotations: seedAnnotations,
    };
  }, [bookmarks, location, props.openedBook.book.id, props.openedBook.readingOpen?.session?.id, toc]);

  const { autosave } = useReadingProgressAutosave({
    enabled: true,
    autosaveDelayMs: 5000,
    spl: props.spl,
    sessionId: state.sessionId,
    profileVersion,
    location: state.location,
  });

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

  const sessionId = state.sessionId;

  const seedBookmarksFromOpen = useCallback((annotations: ReadingAnnotation[] | null | undefined) => {
    const seeded: ReaderBookmark[] = [];
    for (const a of annotations ?? []) {
      const b = toReaderBookmark(a);
      if (b) seeded.push(b);
    }
    if (seeded.length > 0) setBookmarks(seeded);
  }, []);

  // Seed from readingOpen response (first page) immediately when available.
  const lastSeedKeyRef = useRef<string>("");
  useEffect(() => {
    const open = props.openedBook.readingOpen;
    const id = open?.session?.id ?? "";
    if (!id) return;
    const key = `${props.openedBook.objectUrl}|${id}`;
    if (lastSeedKeyRef.current === key) return;
    lastSeedKeyRef.current = key;
    seedBookmarksFromOpen(open?.annotations?.results as unknown as ReadingAnnotation[] | undefined);
  }, [props.openedBook.objectUrl, props.openedBook.readingOpen, seedBookmarksFromOpen]);

  // Load bookmarks for the session (non-blocking).
  useEffect(() => {
    if (!props.spl) return;
    if (!sessionId) return;
    setBookmarkStatus("loading");
    setBookmarkError(null);

    let cancelled = false;
    void (async () => {
      try {
        const all: ReadingAnnotation[] = [];
        let page = 1;
        for (let guard = 0; guard < 50; guard += 1) {
          const res = await props.spl!.reading.annotations.list({ sessionId, page });
          all.push(...(res.results as unknown as ReadingAnnotation[]));
          if (!res.next) break;
          page += 1;
        }
        if (cancelled) return;
        const next: ReaderBookmark[] = [];
        for (const a of all) {
          const b = toReaderBookmark(a);
          if (b) next.push(b);
        }
        setBookmarks(next);
        setBookmarkStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setBookmarkStatus("error");
        setBookmarkError(e instanceof Error ? e.message : "Failed to load bookmarks.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.spl, sessionId]);

  const currentBookmark = useMemo(() => {
    const cfi = location?.cfi?.trim() ?? "";
    if (!cfi) return null;
    // v1: exact CFI string match
    return bookmarks.find((b) => b.cfi === cfi) ?? null;
  }, [bookmarks, location?.cfi]);

  const removeById = useCallback(
    async (bookmarkId: string) => {
      if (!props.spl) return;
      if (!bookmarkId) return;
      setBookmarkBusy(true);
      setBookmarkError(null);
      try {
        await props.spl.reading.annotations.remove(bookmarkId);
        setBookmarks((prev) => prev.filter((b) => b.id !== bookmarkId));
      } catch (e) {
        setBookmarkError(e instanceof Error ? e.message : "Failed to remove bookmark.");
      } finally {
        setBookmarkBusy(false);
      }
    },
    [props.spl],
  );

  const toggleCurrent = useCallback(async () => {
    if (!props.spl) return;
    if (!sessionId) return;
    if (!profileVersion) return;
    const cfi = location?.cfi?.trim() ?? "";
    if (!cfi) return;

    if (currentBookmark) {
      await removeById(currentBookmark.id);
      return;
    }

    setBookmarkBusy(true);
    setBookmarkError(null);
    try {
      const created = await props.spl.reading.annotations.createBookmark({
        sessionId,
        profileVersion,
        cfi,
      });
      const b = toReaderBookmark(created as unknown as ReadingAnnotation);
      if (b) setBookmarks((prev) => [...prev.filter((x) => x.id !== b.id), b]);
    } catch (e) {
      setBookmarkError(e instanceof Error ? e.message : "Failed to create bookmark.");
    } finally {
      setBookmarkBusy(false);
    }
  }, [currentBookmark, location?.cfi, profileVersion, props.spl, removeById, sessionId]);

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
        bookmark={{
          enabled: Boolean(sessionId && profileVersion && location?.cfi),
          isBookmarked: Boolean(currentBookmark),
          busy: bookmarkBusy,
          onToggle: () => {
            void toggleCurrent();
          },
        }}
      />
    ),
    debugPanel: (
      <section className="panel spReaderDebugPanel">
        <h2 className="panelTitle">Reader debug (temporary)</h2>
        <div className="muted">Session: {state.sessionId ?? "(none yet)"}</div>
        <div className="muted">Book ID: {String(state.bookId)}</div>
        <div className="muted">
          Autosave: {autosave.status}
          {autosave.lastSavedAt ? ` \u00B7 ${autosave.lastSavedAt}` : ""}
          {autosave.lastSavedCfi ? ` \u00B7 ${autosave.lastSavedCfi.slice(0, 48)}...` : ""}
        </div>
        {autosave.error ? <div className="errorText">{autosave.error}</div> : null}
        {lastError ? <div className="errorText">{lastError}</div> : null}
        {bookmarkError ? <div className="errorText">{bookmarkError}</div> : null}
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
    bookmarks: {
      items: bookmarks,
      status: bookmarkStatus,
      error: bookmarkError,
      currentBookmarkId: currentBookmark?.id ?? null,
      busy: bookmarkBusy,
      toggleCurrent,
      removeById,
    },
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
