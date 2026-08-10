import type { ReaderSettings } from "../../../storage/readerSettings";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ReadingShell } from "../shell/ReadingShell";
import type { ReadingShellCommandValue, ReadingShellEvent } from "../shell/ReaderShell.Types";
import type { ReaderDescribeCfiHandle, ReaderDisplayCfiHandle, ReaderProbeCfiHandle, ReaderSearchBookHandle, StagedSelectionHandle, StagedSelectionSource } from "../domain/ReaderBridge.Types";
import type { DurableAnnotationToolbarItem } from "../shell/ReaderDurableAnnotationToolbar.Toolbar";
import type { ReaderAnnotation, ReaderHighlightMark, ReaderLocationTarget, ReaderSelection } from "../domain/types";
import type { ReadingSessionState } from "./types";
import type { OpenedBook } from "../types";
import { useReadingProgressAutosave } from "./progress/ReadingProgressAutosave.Lifecycle";
import { READING_PROGRESS_AUTOSAVE_DELAY_MS } from "./progress/ReadingProgressAutosave.Controller";
import { buildReadingSessionAutosaveStatus } from "./progress/ReadingSessionProgress.Presenter";
import type { SecondPassClient } from "@secondpass/client";
import type { ReaderBookmarkViewModel } from "../annotations/bookmarkUtils";
import type { HighlightViewModel } from "../annotations/viewModels";
import { toReaderAnnotation } from "../annotations/annotationUtils";
import { useSessionAnnotations } from "./useSessionAnnotations";
import { usePreviousSessionLayers, type PreviousSessionAnnotationGroup } from "./usePreviousSessionLayers";
import { useCurrentSessionMeta } from "./useCurrentSessionMeta";
import { buildReaderLocationLabel, buildReaderStatusLine } from "../display/ReaderLocation.Presenter";
import {
  useCurrentSessionAnnotationActions,
  type ReaderBookmarkMutationResult,
} from "./annotations/CurrentSessionAnnotation.Actions";
import { useReadingSessionBridgeController } from "./ReadingSessionBridge.Controller";

export type ReadingSessionOrchestratorProps = {
  openedBook: OpenedBook;
  spl?: SecondPassClient | null;
  settings?: ReaderSettings;
  onSettingsChange?: (patch: Partial<ReaderSettings>) => void;
  onSettingsReset?: () => void;
  onStagedSelectionCommitted?: (source: StagedSelectionSource) => void;
  onStagedSelectionCanceled?: (source: StagedSelectionSource) => void;
  onUnrelatedNavigation?: () => void;
  onOpenAnnotationInWorkspace?: (annotationId: string, mode: "editable" | "readonly") => void;
  children: (arg: {
    state: ReadingSessionState;
    canMutateSession: boolean;
    statusLine: string[];
    autosaveStatus: { text: string; title?: string } | null;
    shell: ReactNode;
    debugPanel: ReactNode | null;
    sendCommand: (command: ReadingShellCommandValue) => void;
    search: {
      ready: boolean;
      searchBook: ReaderSearchBookHandle | null;
      probeCfi: ReaderProbeCfiHandle | null;
      displayCfi: ReaderDisplayCfiHandle | null;
      jumpToResult: (cfi: string) => void;
      jumpToCfi: (cfi: string) => void;
      jumpToCfiRange: (cfiRange: string) => void;
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
      toggleBookmarkAtCurrentLocation: () => Promise<ReaderBookmarkMutationResult>;
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

// Composition owner: wires session behavior owners to the reader shell and activity render state.
export function ReadingSessionOrchestrator(props: ReadingSessionOrchestratorProps) {
  const activeBookKey = `${props.openedBook.book.id}|${props.openedBook.objectUrl}`;
  const {
    location,
    progressLocation,
    toc,
    pendingCommand,
    searchBook,
    probeCfi,
    displayCfi,
    stagedSelectionHandle,
    describeCfi,
    temporarySearchHighlightCfi,
    sendCommand,
    jumpToSearchResult,
    jumpToCfi,
    jumpToCfiRange,
    clearTemporaryHighlight,
    handleSearchReady,
    handleProbeCfiReady,
    handleDisplayCfiReady,
    handleStagedSelectionReady,
    handleDescribeCfiReady: handleBridgeDescribeCfiReady,
    handleStagedSelectionCommitted,
    handleStagedSelectionCanceled,
    handleShellEvent,
  } = useReadingSessionBridgeController({
    activeBookKey,
    onStagedSelectionCommitted: props.onStagedSelectionCommitted,
    onStagedSelectionCanceled: props.onStagedSelectionCanceled,
  });
  const generatedLocationLabel = useMemo(
    () => buildReaderLocationLabel(location),
    [location],
  );
  const progressLocationLabel = useMemo(
    () => buildReaderLocationLabel(progressLocation),
    [progressLocation],
  );
  const finalProgress = useMemo(
    () => progressLocation?.cfi
      ? { cfi: progressLocation.cfi, locationLabel: progressLocationLabel }
      : undefined,
    [progressLocation?.cfi, progressLocationLabel],
  );
  const bootstrapSession = props.openedBook.marginaliaBootstrap?.session ?? null;
  const sessionId = bootstrapSession?.id ?? null;
  const canMutateSession = bootstrapSession?.status === "active";
  const { currentSessionMeta, updateCurrentSessionMeta, closeCurrentSession } = useCurrentSessionMeta({
    spl: props.spl,
    sessionId,
    finalProgress,
  });

  const initialDisplayTarget: ReaderLocationTarget | undefined = useMemo(() => {
    const progress = props.openedBook.marginaliaBootstrap?.session?.progress;
    const cfi = progress?.cfi ?? null;
    if (typeof cfi === "string" && cfi.trim()) return { type: "cfi", cfi: cfi.trim() };
    return undefined;
  }, [props.openedBook.marginaliaBootstrap?.session?.progress]);

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

  const handleDescribeCfiReadyForReader = useCallback(
    (handle: ReaderDescribeCfiHandle | null) => {
      handleDescribeCfiReady(handle);
      handleBridgeDescribeCfiReady(handle);
    },
    [handleBridgeDescribeCfiReady, handleDescribeCfiReady],
  );

  const previousLayers = usePreviousSessionLayers({
    spl: props.spl,
    bookId: props.openedBook.book.id,
    currentSessionId: sessionId,
    describeCfi,
    toc,
    bookTitle: props.openedBook.book.title,
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
    enabled: canMutateSession,
    autosaveDelayMs: READING_PROGRESS_AUTOSAVE_DELAY_MS,
    spl: props.spl,
    sessionId: state.sessionId,
    location: progressLocation,
    savedProgress: bootstrapSession?.progress ?? null,
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
    return buildReadingSessionAutosaveStatus({
      sessionId: state.sessionId,
      status: autosave.status,
      lastSavedAt: autosave.lastSavedAt,
      nextSaveAt: autosave.nextSaveAt,
      nowMs,
    });
  }, [autosave.lastSavedAt, autosave.nextSaveAt, autosave.status, nowMs, state.sessionId]);

  const statusLine = useMemo(() => {
    return buildReaderStatusLine({ location: state.location, toc: state.toc, bookTitle: props.openedBook.book.title });
  }, [props.openedBook.book.title, state.location, state.toc]);

  const visibleHighlightMarks: ReaderHighlightMark[] = useMemo(() => {
    const out: ReaderHighlightMark[] = [...highlightMarks, ...previousLayers.selectedHighlightMarks];
    // Preserve existing behavior: staged selection mark composes in the shell; durable marks are filtered here only.
    return out;
  }, [highlightMarks, previousLayers.selectedHighlightMarks]);

  const annotationToolbarItems: DurableAnnotationToolbarItem[] = useMemo(() => {
    return visibleHighlightMarks
      .filter((mark) => Boolean(mark.id && mark.cfiRange))
      .map((mark) => ({
        id: mark.id,
        mode: mark.readOnly ? "readonly" : "editable",
        quoteText: mark.text,
        note: mark.note,
        color: mark.color,
      }));
  }, [visibleHighlightMarks]);

  const onShellEvent = useCallback((event: ReadingShellEvent) => {
    if (event.type === "locationsReady") {
      onLocationsReady();
      return;
    }
    handleShellEvent(event);
  }, [handleShellEvent, onLocationsReady]);

  const {
    annotationBusy,
    removeById,
    updateHighlight,
    toggleBookmarkAtCurrentLocation,
    createHighlight,
  } = useCurrentSessionAnnotationActions({
    identity: `${activeBookKey}|${sessionId ?? ""}`,
    spl: props.spl,
    sessionId,
    location,
    locationLabel: generatedLocationLabel,
    currentBookmark,
    annotationsRaw,
    setAnnotationsRaw,
    setAnnotationError,
    canMutate: canMutateSession,
  });

  return props.children({
    state,
    canMutateSession,
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
        onDescribeCfiReady={handleDescribeCfiReadyForReader}
        onProbeCfiReady={handleProbeCfiReady}
        onDisplayCfiReady={handleDisplayCfiReady}
        onSearchReady={handleSearchReady}
        onStagedSelectionReady={handleStagedSelectionReady}
        onStagedSelectionCommitted={handleStagedSelectionCommitted}
        onStagedSelectionCanceled={handleStagedSelectionCanceled}
        onUnrelatedNavigation={props.onUnrelatedNavigation}
        annotationToolbarItems={annotationToolbarItems}
        onUpdateHighlight={updateHighlight}
        onRemoveAnnotation={removeById}
        onOpenAnnotationInWorkspace={props.onOpenAnnotationInWorkspace}
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
      probeCfi,
      displayCfi,
      jumpToResult: jumpToSearchResult,
      jumpToCfi,
      jumpToCfiRange,
      clearTemporaryHighlight,
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
