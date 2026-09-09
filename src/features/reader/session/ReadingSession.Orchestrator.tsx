import type { ReaderSettings } from "../../../storage/ReaderSettings.Store";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ReadingShell } from "../shell/Reading.Shell";
import type { ReadingShellCommandValue, ReadingShellEvent } from "../shell/ReaderShell.Types";
import type { ReaderDescribeCfiHandle, ReaderDisplayCfiHandle, ReaderProbeCfiHandle, ReaderSearchBookHandle, StagedSelectionHandle, StagedSelectionSource } from "../domain/ReaderBridge.Types";
import type { ReaderLocationTarget, ReaderSelection } from "../domain/ReaderDomain.Types";
import type { ReadingSessionState } from "./ReadingSession.Types";
import type { OpenedBook } from "../Reader.Types";
import { useReadingProgressAutosave } from "./progress/ReadingProgressAutosave.Lifecycle";
import { READING_PROGRESS_AUTOSAVE_DELAY_MS } from "./progress/ReadingProgressAutosave.Controller";
import { buildReadingSessionAutosaveStatus } from "./progress/ReadingSessionProgress.Presenter";
import type { SecondPassClient } from "@secondpass/client";
import type { ReaderBookmarkViewModel } from "../annotations/ReaderBookmark.Mapper";
import type { HighlightViewModel } from "../annotations/ReaderAnnotationViewModels.Types";
import { useSessionAnnotations } from "./annotations/SessionAnnotations.Controller";
import { usePreviousSessionLayers } from "./previousSession/PreviousSessionLayers.Controller";
import type { PreviousSessionAnnotationGroup } from "./previousSession/PreviousSessionViewModels.Presenter";
import { useCurrentSessionMeta } from "./CurrentSessionMetadata.Controller";
import { buildReaderStatusLine, buildSavedReaderLocationLabel } from "../display/ReaderLocation.Presenter";
import { useCurrentSessionAnnotationActions } from "./annotations/CurrentSessionAnnotation.Actions";
import type { ReaderBookmarkMutationResult } from "./annotations/CurrentSessionBookmark.Actions";
import { useReadingSessionBridgeController } from "./ReadingSessionBridge.Controller";
import {
  buildReadingSessionAnnotationToolbarItems,
  buildReadingSessionState,
  composeReadingSessionDurableMarks,
} from "./ReadingSessionRender.Presenter";
import { getReaderBootstrapState } from "./ReaderBootstrap.State";
import { useOfflineReadingProgress } from "./progress/OfflineReadingProgress.Lifecycle";
import { useOfflineCurrentSessionAnnotations } from "./annotations/OfflineCurrentSessionAnnotation.Lifecycle";

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
    canMutateAnnotations: boolean;
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
    () => buildSavedReaderLocationLabel({ location, toc, bookTitle: props.openedBook.book.title }),
    [location, props.openedBook.book.title, toc],
  );
  const progressLocationLabel = useMemo(
    () => buildSavedReaderLocationLabel({ location: progressLocation, toc, bookTitle: props.openedBook.book.title }),
    [progressLocation, props.openedBook.book.title, toc],
  );
  const finalProgress = useMemo(
    () => progressLocation?.cfi
      ? { cfi: progressLocation.cfi, locationLabel: progressLocationLabel }
      : undefined,
    [progressLocation?.cfi, progressLocationLabel],
  );
  const {
    serverBootstrap,
    localBootstrap,
    sessionId,
    canMutateSession,
  } = getReaderBootstrapState(props.openedBook);
  const serverSpl = serverBootstrap ? props.spl : null;
  const bootstrapSession = serverBootstrap?.session ?? null;
  const initialDisplayTarget: ReaderLocationTarget | undefined = useMemo(() => {
    const progress = serverBootstrap?.session?.progress ?? localBootstrap?.continuity.progress;
    const cfi = progress?.cfi ?? null;
    if (typeof cfi === "string" && cfi.trim()) return { type: "cfi", cfi: cfi.trim() };
    return undefined;
  }, [localBootstrap?.continuity.progress, serverBootstrap?.session?.progress]);

  const sessionAnnotations = useSessionAnnotations({
    openedBook: props.openedBook,
    spl: serverSpl,
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
    spl: serverSpl,
    bookId: props.openedBook.book.id,
    currentSessionId: sessionId,
    describeCfi,
    toc,
    bookTitle: props.openedBook.book.title,
  });

  const state: ReadingSessionState = useMemo(() => {
    return buildReadingSessionState({
      bookId: props.openedBook.book.id,
      sessionId,
      location,
      toc,
      annotations: annotationsRaw,
    });
  }, [annotationsRaw, location, props.openedBook.book.id, sessionId, toc]);

  const { autosave, prepareProgressForClose, resumeProgressAfterCloseFailure } = useReadingProgressAutosave({
    enabled: canMutateSession,
    autosaveDelayMs: READING_PROGRESS_AUTOSAVE_DELAY_MS,
    spl: serverSpl,
    sessionId: state.sessionId,
    location: progressLocation,
    toc,
    bookTitle: props.openedBook.book.title,
    savedProgress: bootstrapSession?.progress ?? null,
  });
  const offlineProgress = useOfflineReadingProgress({
    bootstrap: localBootstrap,
    location: progressLocation,
    toc,
    bookTitle: props.openedBook.book.title,
  });
  const { currentSessionMeta, updateCurrentSessionMeta, closeCurrentSession } = useCurrentSessionMeta({
    spl: serverSpl,
    sessionId,
    finalProgress,
    prepareProgressForClose,
    resumeProgressAfterCloseFailure,
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
    if (localBootstrap) {
      return offlineProgress.status === "error"
        ? { text: "Offline progress not saved." }
        : null;
    }
    return buildReadingSessionAutosaveStatus({
      sessionId: state.sessionId,
      status: autosave.status,
      lastSavedAt: autosave.lastSavedAt,
      nextSaveAt: autosave.nextSaveAt,
      nowMs,
    });
  }, [autosave.lastSavedAt, autosave.nextSaveAt, autosave.status, localBootstrap, nowMs, offlineProgress.status, state.sessionId]);

  const statusLine = useMemo(() => {
    const lines = buildReaderStatusLine({ location: state.location, toc: state.toc, bookTitle: props.openedBook.book.title });
    return localBootstrap ? ["Offline", ...lines] : lines;
  }, [localBootstrap, props.openedBook.book.title, state.location, state.toc]);

  const visibleHighlightMarks = useMemo(
    () => composeReadingSessionDurableMarks(highlightMarks, previousLayers.selectedHighlightMarks),
    [highlightMarks, previousLayers.selectedHighlightMarks],
  );

  const annotationToolbarItems = useMemo(
    () => buildReadingSessionAnnotationToolbarItems(visibleHighlightMarks),
    [visibleHighlightMarks],
  );

  const onShellEvent = useCallback((event: ReadingShellEvent) => {
    if (event.type === "locationsReady") {
      onLocationsReady();
      return;
    }
    handleShellEvent(event);
  }, [handleShellEvent, onLocationsReady]);

  const {
    annotationBusy: onlineAnnotationBusy,
    removeById: removeOnlineAnnotation,
    updateHighlight: updateOnlineHighlight,
    toggleBookmarkAtCurrentLocation: toggleOnlineBookmark,
    createHighlight: createOnlineHighlight,
  } = useCurrentSessionAnnotationActions({
    identity: `${activeBookKey}|${sessionId ?? ""}`,
    spl: serverSpl,
    sessionId,
    location,
    locationLabel: generatedLocationLabel,
    currentBookmark,
    annotationsRaw,
    setAnnotationsRaw,
    setAnnotationError,
    canMutate: canMutateSession,
  });
  const offlineAnnotations = useOfflineCurrentSessionAnnotations({
    bootstrap: localBootstrap,
    location,
    locationLabel: generatedLocationLabel,
    currentBookmark,
    setAnnotationsRaw,
    setAnnotationError,
  });
  const canMutateAnnotations = canMutateSession || offlineAnnotations.canMutate;
  const annotationBusy = localBootstrap ? offlineAnnotations.annotationBusy : onlineAnnotationBusy;
  const removeById = localBootstrap ? offlineAnnotations.removeById : removeOnlineAnnotation;
  const updateHighlight = localBootstrap ? offlineAnnotations.updateHighlight : updateOnlineHighlight;
  const toggleBookmarkAtCurrentLocation = localBootstrap
    ? offlineAnnotations.toggleBookmarkAtCurrentLocation
    : toggleOnlineBookmark;
  const createHighlight = localBootstrap ? offlineAnnotations.createHighlight : createOnlineHighlight;

  return props.children({
    state,
    canMutateSession,
    canMutateAnnotations,
    statusLine,
    autosaveStatus,
    shell: (
      <ReadingShell
        blob={props.openedBook.blob}
        initialDisplayTarget={initialDisplayTarget}
        onEvent={onShellEvent}
        command={pendingCommand ?? undefined}
        toc={toc}
        currentHref={location?.href}
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
        onUpdateHighlight={canMutateAnnotations ? updateHighlight : undefined}
        onRemoveAnnotation={canMutateAnnotations ? removeById : undefined}
        onOpenAnnotationInWorkspace={props.onOpenAnnotationInWorkspace}
        highlightMarks={visibleHighlightMarks}
        onCommitHighlight={canMutateAnnotations ? async (arg) => createHighlight(arg) : undefined}
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
