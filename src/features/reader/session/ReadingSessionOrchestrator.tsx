import type { ReaderSettings } from "../../../storage/readerSettings";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ReadingShell } from "../shell/ReadingShell";
import type { ReaderSearchBookHandle, ReadingShellCommand, ReadingShellCommandValue, ReadingShellEvent } from "../shell/types";
import type { StagedSelectionHandle, StagedSelectionSource } from "../shell/stagedSelectionTypes";
import type { ReaderAnnotation, ReaderHighlightMark, ReaderLocation, ReaderLocationTarget, ReaderSelection } from "../domain/types";
import type { ReaderTocItem } from "../domain/types";
import type { ReadingSessionState } from "./types";
import type { OpenedBook } from "../types";
import { useReadingProgressAutosave } from "./useReadingProgressAutosave";
import type { SecondPassClient } from "@secondpass/client";
import type { ReaderBookmarkViewModel } from "../annotations/bookmarkUtils";
import type { HighlightViewModel } from "../annotations/viewModels";
import { toReaderAnnotation } from "../annotations/annotationUtils";
import { useSessionAnnotations } from "./useSessionAnnotations";
import { usePreviousSessionLayers, type PreviousSessionAnnotationGroup } from "./usePreviousSessionLayers";
import { useCurrentSessionMeta } from "./useCurrentSessionMeta";
import { buildReaderStatusLine } from "./readerSessionLabels";
import { useCurrentSessionAnnotationActions } from "./useCurrentSessionAnnotationActions";

export type ReadingSessionOrchestratorProps = {
  openedBook: OpenedBook;
  spl?: SecondPassClient | null;
  settings?: ReaderSettings;
  onSettingsChange?: (patch: Partial<ReaderSettings>) => void;
  onSettingsReset?: () => void;
  onStagedSelectionCommitted?: (source: StagedSelectionSource) => void;
  onStagedSelectionCanceled?: (source: StagedSelectionSource) => void;
  children: (arg: {
    state: ReadingSessionState;
    statusLine: string[];
    autosaveStatus: { text: string; title?: string } | null;
    shell: ReactNode;
    debugPanel: ReactNode | null;
    sendCommand: (command: ReadingShellCommandValue) => void;
    search: {
      ready: boolean;
      searchBook: ReaderSearchBookHandle | null;
      jumpToResult: (cfi: string) => void;
      jumpToCfi: (cfi: string) => void;
      clearTemporaryHighlight: () => void;
    };
    stagedSelection: {
      ready: boolean;
      handle: StagedSelectionHandle | null;
    };
    marginalia: {
      listStatus: "idle" | "loading" | "ready" | "error";
      listError: string | null;
      previousLayers: Array<{ sessionId: string; label: string; labelParts: string[]; highlightCount: number; status: "idle" | "loading" | "ready" | "error"; error?: string }>;
      selectedPreviousSessionIds: string[];
      togglePreviousSession: (sessionId: string) => void;
    };
    annotations: {
      items: Array<ReaderBookmarkViewModel | HighlightViewModel>;
      status: "idle" | "loading" | "ready" | "error";
      error: string | null;
      busy: boolean;
      toggleBookmarkAtCurrentLocation: () => Promise<void>;
      createHighlight: (input: { selection: ReaderSelection; color: string; note?: string }) => Promise<void>;
      removeById: (annotationId: string) => Promise<void>;
      updateHighlight: (annotationId: string, update: { note: string; color: string }) => Promise<void>;
      previousSessionGroups: PreviousSessionAnnotationGroup[];
      enablePreviousSession: (sessionId: string) => void;
      currentSessionMeta: { name: string | null; notes: string | null; status: "idle" | "loading" | "ready" | "error"; error: string | null };
      updateCurrentSessionMeta: (update: { name: string; notes: string }) => Promise<void>;
      closeCurrentSession: (input: { name: string; notes: string }) => Promise<void>;
    };
  }) => ReactNode;
};

// Placeholder orchestrator: will eventually own session state, SPL calls, and Shell cross-talk.
export function ReadingSessionOrchestrator(props: ReadingSessionOrchestratorProps) {
  const [location, setLocation] = useState<ReaderLocation | null>(null);
  const [toc, setToc] = useState<ReaderTocItem[] | null>(null);
  const [pendingCommand, setPendingCommand] = useState<ReadingShellCommand | null>(null);
  const [searchBook, setSearchBook] = useState<ReaderSearchBookHandle | null>(null);
  const [stagedSelectionHandle, setStagedSelectionHandle] = useState<StagedSelectionHandle | null>(null);
  const [temporarySearchHighlightCfi, setTemporarySearchHighlightCfi] = useState<string | null>(null);
  const commandSeqRef = useRef(0);
  const profileVersion = props.openedBook.readingOpen?.profile_version ?? null;
  const sessionId = props.openedBook.readingOpen?.session?.id ?? null;
  const { currentSessionMeta, updateCurrentSessionMeta, closeCurrentSession } = useCurrentSessionMeta({
    spl: props.spl,
    sessionId,
  });

  const initialDisplayTarget: ReaderLocationTarget | undefined = useMemo(() => {
    const progress = props.openedBook.readingOpen?.progress;
    const cfi =
      progress?.current_location?.cfi ??
      progress?.current_location?.selector?.value ??
      null;
    if (typeof cfi === "string" && cfi.trim()) return { type: "cfi", cfi: cfi.trim() };
    return undefined;
  }, [props.openedBook.readingOpen?.progress]);

  const sessionAnnotations = useSessionAnnotations({
    openedBook: props.openedBook,
    spl: props.spl,
    sessionId,
    location,
    toc,
  });
  const {
    raw: annotationsRaw,
    setRaw: setAnnotationsRaw,
    status: annotationStatus,
    error: annotationError,
    setError: setAnnotationError,
    items: annotationItems,
    highlightMarks,
    handleDescribeCfiReady,
    onLocationsReady,
    currentBookmark,
  } = sessionAnnotations;

  const previousLayers = usePreviousSessionLayers({
    spl: props.spl,
    bookId: props.openedBook.book.id,
    currentSessionId: sessionId,
  });

  const state: ReadingSessionState = useMemo(() => {
    const seedAnnotations: ReaderAnnotation[] = annotationsRaw
      .map((a) => toReaderAnnotation(a))
      .filter((a): a is ReaderAnnotation => Boolean(a));
    return {
      bookId: props.openedBook.book.id,
      sessionId,
      location,
      toc,
      annotations: seedAnnotations,
    };
  }, [annotationsRaw, location, props.openedBook.book.id, sessionId, toc]);

  const { autosave } = useReadingProgressAutosave({
    enabled: true,
    autosaveDelayMs: 5000,
    spl: props.spl,
    sessionId: state.sessionId,
    profileVersion,
    location: state.location,
  });

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const shouldTickAutosaveCountdown = Boolean(
    state.sessionId &&
      autosave.status !== "saving" &&
      autosave.status !== "saved" &&
      typeof autosave.nextSaveAt === "number" &&
      autosave.nextSaveAt > nowMs,
  );

  useEffect(() => {
    if (!shouldTickAutosaveCountdown) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [shouldTickAutosaveCountdown]);

  const autosaveStatus = useMemo((): { text: string; title?: string } | null => {
    if (!state.sessionId) return null;

    const lastSavedTitle =
      autosave.lastSavedAt && !Number.isNaN(Date.parse(autosave.lastSavedAt))
        ? `Last saved: ${new Date(autosave.lastSavedAt).toLocaleString()}`
        : undefined;

    switch (autosave.status) {
      case "saving":
        return { text: "Autosave: sending" };
      case "saved":
        return { text: "Autosave: complete", title: lastSavedTitle };
      case "pending":
      case "idle":
        if (typeof autosave.nextSaveAt === "number") {
          const remaining = Math.max(0, autosave.nextSaveAt - nowMs);
          const seconds = Math.max(0, Math.ceil(remaining / 1000));
          return { text: `Autosave: waiting (${seconds}s)` };
        }
        return { text: "Autosave: waiting" };
      case "error":
        // Keep UI terminology constrained; log details in console via hook/orchestrator.
        return { text: "Autosave: waiting" };
    }
  }, [autosave.lastSavedAt, autosave.nextSaveAt, autosave.status, nowMs, state.sessionId]);

  const statusLine = useMemo(() => {
    return buildReaderStatusLine({ location: state.location, toc: state.toc });
  }, [state.location, state.toc]);

  const visibleHighlightMarks: ReaderHighlightMark[] = useMemo(() => {
    const out: ReaderHighlightMark[] = [...highlightMarks, ...previousLayers.selectedHighlightMarks];
    // Preserve existing behavior: staged selection mark composes in the shell; durable marks are filtered here only.
    return out;
  }, [highlightMarks, previousLayers.selectedHighlightMarks]);

  const sendCommand = useCallback((command: ReadingShellCommandValue) => {
    commandSeqRef.current += 1;
    setPendingCommand({ seq: commandSeqRef.current, value: command });
  }, []);

  const jumpToSearchResult = useCallback(
    (cfi: string) => {
      const trimmed = cfi.trim();
      if (!trimmed) return;
      setTemporarySearchHighlightCfi(null);
      sendCommand({ type: "displaySearchResult", cfi: trimmed });
    },
    [sendCommand],
  );

  const jumpToCfi = useCallback(
    (cfi: string) => {
      const trimmed = cfi.trim();
      if (!trimmed) return;
      sendCommand({ type: "display", target: { type: "cfi", cfi: trimmed } });
    },
    [sendCommand],
  );

  const clearSearchResultHighlight = useCallback(() => {
    setTemporarySearchHighlightCfi(null);
  }, []);

  useEffect(() => {
    if (!temporarySearchHighlightCfi) return;
    const id = window.setTimeout(() => setTemporarySearchHighlightCfi(null), 3500);
    return () => window.clearTimeout(id);
  }, [temporarySearchHighlightCfi]);

  const handleSearchReady = useCallback((fn: ReaderSearchBookHandle | null) => {
    setSearchBook(() => fn);
  }, []);

  const handleStagedSelectionReady = useCallback((handle: StagedSelectionHandle | null) => {
    setStagedSelectionHandle(handle);
  }, []);

  const handleStagedSelectionCommitted = useCallback(
    (source: StagedSelectionSource) => {
      if (source.kind === "import") setTemporarySearchHighlightCfi(null);
      props.onStagedSelectionCommitted?.(source);
    },
    [props.onStagedSelectionCommitted],
  );

  const handleStagedSelectionCanceled = useCallback(
    (source: StagedSelectionSource) => {
      if (source.kind === "import") setTemporarySearchHighlightCfi(null);
      props.onStagedSelectionCanceled?.(source);
    },
    [props.onStagedSelectionCanceled],
  );

  // Keep this callback referentially stable: `ReadingShell`'s engine init effect depends on `onEvent`.
  // Unstable callbacks here can cause destroy/re-init loops (duplicated network requests, blank viewport).
  const onShellEvent = useCallback((event: ReadingShellEvent) => {
    switch (event.type) {
      case "locationChanged":
        setLocation(event.location);
        return;
      case "displayError":
        // Keep errors visible in the browser console; avoid a permanent reader debug panel in the UI.
        // eslint-disable-next-line no-console
        console.error("Reader error", event.error);
        return;
      case "tocReady":
        setToc(event.toc);
        return;
      case "locationsReady":
        onLocationsReady();
        return;
      case "navigate":
        sendCommand({ type: "display", target: event.target });
        return;
      case "searchResultDisplayed":
        setTemporarySearchHighlightCfi(event.cfi);
        return;
    }
  }, [onLocationsReady, sendCommand]);

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

  const {
    annotationBusy,
    removeById,
    updateHighlight,
    toggleBookmarkAtCurrentLocation,
    createHighlight,
  } = useCurrentSessionAnnotationActions({
    spl: props.spl,
    sessionId,
    profileVersion,
    location,
    currentBookmark,
    annotationsRaw,
    setAnnotationsRaw,
    setAnnotationError,
  });

  return props.children({
    state,
    statusLine,
    autosaveStatus,
    shell: (
      <ReadingShell
        blob={props.openedBook.blob}
        initialDisplayTarget={initialDisplayTarget}
        onEvent={onShellEvent}
        command={pendingCommand ?? undefined}
        toc={toc}
        temporarySearchHighlightCfi={temporarySearchHighlightCfi}
        onDescribeCfiReady={handleDescribeCfiReady}
        onSearchReady={handleSearchReady}
        onStagedSelectionReady={handleStagedSelectionReady}
        onStagedSelectionCommitted={handleStagedSelectionCommitted}
        onStagedSelectionCanceled={handleStagedSelectionCanceled}
        highlightMarks={visibleHighlightMarks}
        onCommitHighlight={async (arg) => createHighlight(arg)}
        highlightCommitBusy={annotationBusy}
        settings={props.settings}
        onSettingsChange={props.onSettingsChange}
        onSettingsReset={props.onSettingsReset}
      />
    ),
    debugPanel: null,
    sendCommand,
    search: {
      ready: Boolean(searchBook),
      searchBook,
      jumpToResult: jumpToSearchResult,
      jumpToCfi,
      clearTemporaryHighlight: clearSearchResultHighlight,
    },
    stagedSelection: {
      ready: Boolean(stagedSelectionHandle),
      handle: stagedSelectionHandle,
    },
    marginalia: {
      listStatus: previousLayers.listStatus,
      listError: previousLayers.listError,
      previousLayers: previousLayers.previousLayers,
      selectedPreviousSessionIds: previousLayers.selectedPreviousSessionIds,
      togglePreviousSession: previousLayers.togglePreviousSession,
    },
    annotations: {
      items: annotationItems,
      status: annotationStatus,
      error: annotationError,
      busy: annotationBusy,
      toggleBookmarkAtCurrentLocation,
      createHighlight,
      removeById,
      updateHighlight,
      previousSessionGroups: previousLayers.previousAnnotationGroups,
      enablePreviousSession: previousLayers.togglePreviousSession,
      currentSessionMeta,
      updateCurrentSessionMeta,
      closeCurrentSession,
    },
  });
}
