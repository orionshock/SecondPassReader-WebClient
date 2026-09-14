import type { ReaderSettings } from "../../../storage/ReaderSettings.Store";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { ReadingShell } from "../shell/ReadingShell.Orchestrator";
import type { ReadingShellEvent } from "../shell/ReaderShell.Types";
import type { StagedSelectionSource } from "../domain/ReaderBridge.Types";
import type { ReaderLocationTarget } from "../domain/ReaderDomain.Types";
import type { ReadingSessionRenderState, ReadingSessionState } from "./ReadingSession.Types";
import type { OpenedBook } from "../Reader.Types";
import type { SecondPassClient } from "@secondpass/client";
import { useSessionAnnotations } from "./annotations/SessionAnnotations.Controller";
import { usePreviousSessionLayers } from "./previousSession/PreviousSessionLayers.Controller";
import { useCurrentSessionMeta } from "./CurrentSessionMetadata.Controller";
import { buildReaderStatusLine, buildSavedReaderLocationLabel } from "../display/ReaderLocation.Presenter";
import { useReadingSessionBridgeController } from "./ReadingSessionBridge.Controller";
import {
  buildReadingSessionAnnotationToolbarItems,
  buildReadingSessionState,
  composeReadingSessionDurableMarks,
} from "./ReadingSessionRender.Presenter";
import { getReaderBootstrapState } from "./ReaderBootstrap.State";
import { buildOfflineReadingProgress } from "./progress/OfflineReadingProgress.Controller";
import { canMutateReaderServerSession } from "./ReaderConnectivity.Policy";
import type { BrowserConnectivityStatus } from "../../../app/connectivity/BrowserConnectivity.State";
import { useOnlineReaderOfflineHandoff } from "./OnlineReaderOfflineHandoff.Controller";
import { useCurrentSessionAuthority } from "./CurrentSessionAuthority.Controller";

export type ReadingSessionOrchestratorProps = {
  openedBook: OpenedBook;
  spl?: SecondPassClient | null;
  connectivity: BrowserConnectivityStatus;
  offlineNamespaceKey: string | null;
  settings?: ReaderSettings;
  onSettingsChange?: (patch: Partial<ReaderSettings>) => void;
  onSettingsReset?: () => void;
  onStagedSelectionCommitted?: (source: StagedSelectionSource) => void;
  onStagedSelectionCanceled?: (source: StagedSelectionSource) => void;
  onUnrelatedNavigation?: () => void;
  onOpenAnnotationInWorkspace?: (annotationId: string, mode: "editable" | "readonly") => void;
  children: (arg: ReadingSessionRenderState) => ReactNode;
};

// Selects server or durable-local mutation owners for one mounted Reading Session.
// Authority changes do not change the Reader shell's Blob or engine identity.
export function ReadingSessionOrchestrator(props: ReadingSessionOrchestratorProps) {
  const activeBookKey = `${props.openedBook.book.id}|${props.openedBook.objectUrl}`;
  const {
    location,
    progressLocation,
    toc,
    pendingCommand,
    rendererCapability,
    temporarySearchHighlightCfi,
    sendCommand,
    jumpToSearchResult,
    jumpToCfi,
    jumpToCfiRange,
    clearTemporaryHighlight,
    handleRendererCapabilityReady,
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
    localBootstrap: openedLocalBootstrap,
    sessionId,
    canMutateSession: bootstrapCanMutateSession,
  } = getReaderBootstrapState(props.openedBook);
  const handoffAnnotationsRef = useRef(serverBootstrap?.annotations ?? []);
  const readHandoffAnnotations = useCallback(() => handoffAnnotationsRef.current, []);
  const handoffProgress = useMemo(() => buildOfflineReadingProgress({
    location: progressLocation,
    toc,
    bookTitle: props.openedBook.book.title,
  }), [progressLocation, props.openedBook.book.title, toc]);
  const handoff = useOnlineReaderOfflineHandoff({
    source: props.openedBook.source,
    connectivity: props.connectivity,
    namespaceKey: props.offlineNamespaceKey,
    bookId: String(props.openedBook.book.id),
    serverBootstrap,
    readAnnotations: readHandoffAnnotations,
    progress: handoffProgress,
  });
  const localBootstrap = openedLocalBootstrap ?? handoff.bootstrap;
  // After handoff this mount remains local-first; reconnect delivers through replay instead of reviving parallel server owners.
  const serverSpl = serverBootstrap && !localBootstrap ? props.spl : null;
  const canMutateSession = canMutateReaderServerSession({
    bootstrapCanMutateSession,
    serverClientAvailable: Boolean(serverSpl),
  });
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
  handoffAnnotationsRef.current = annotationsRaw;

  useEffect(() => {
    handleDescribeCfiReady(rendererCapability?.describeCfi ?? null);
  }, [handleDescribeCfiReady, rendererCapability]);

  const previousLayers = usePreviousSessionLayers({
    spl: serverSpl,
    bookId: props.openedBook.book.id,
    currentSessionId: sessionId,
    describeCfi: rendererCapability?.describeCfi,
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

  const currentAuthority = useCurrentSessionAuthority({
    activeBookKey,
    serverClient: serverSpl,
    serverSessionId: state.sessionId,
    serverSessionWritable: canMutateSession,
    savedServerProgress: bootstrapSession?.progress ?? null,
    localBootstrap,
    location: progressLocation,
    toc,
    bookTitle: props.openedBook.book.title,
    locationLabel: generatedLocationLabel,
    currentBookmark,
    annotationsRaw,
    setAnnotationsRaw,
    setAnnotationError,
  });
  const { currentSessionMeta, updateCurrentSessionMeta, closeCurrentSession } = useCurrentSessionMeta({
    spl: serverSpl,
    sessionId,
    finalProgress,
    prepareProgressForClose: currentAuthority.prepareServerProgressForClose,
    resumeProgressAfterCloseFailure: currentAuthority.resumeServerProgressAfterCloseFailure,
  });

  const statusLine = useMemo(() => {
    const lines = buildReaderStatusLine({ location: state.location, toc: state.toc, bookTitle: props.openedBook.book.title });
    return lines;
  }, [props.openedBook.book.title, state.location, state.toc]);

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

  const annotationCapability = currentAuthority.authority.annotations;

  return props.children({
    state,
    presentation: {
      statusLine,
      autosaveStatus: currentAuthority.autosaveStatus,
    },
    authority: currentAuthority.authority,
    administration: {
      writable: canMutateSession,
      currentSessionMeta,
      updateCurrentSessionMeta,
      closeCurrentSession,
    },
    shell: (
      <ReadingShell
        blob={props.openedBook.blob}
        initialDisplayTarget={initialDisplayTarget}
        onEvent={onShellEvent}
        command={pendingCommand ?? undefined}
        toc={toc}
        currentHref={location?.href}
        temporarySearchHighlightCfi={temporarySearchHighlightCfi}
        onRendererCapabilityReady={handleRendererCapabilityReady}
        onStagedSelectionCommitted={handleStagedSelectionCommitted}
        onStagedSelectionCanceled={handleStagedSelectionCanceled}
        onUnrelatedNavigation={props.onUnrelatedNavigation}
        annotationToolbarItems={annotationToolbarItems}
        onUpdateHighlight={annotationCapability?.updateHighlight}
        onRemoveAnnotation={annotationCapability?.removeById}
        onOpenAnnotationInWorkspace={props.onOpenAnnotationInWorkspace}
        highlightMarks={visibleHighlightMarks}
        onCommitHighlight={annotationCapability?.createHighlight}
        highlightCommitBusy={annotationCapability?.busy ?? false}
        settings={props.settings}
        onSettingsChange={props.onSettingsChange}
        onSettingsReset={props.onSettingsReset}
      />
    ),
    debugPanel: null,
    renderer: {
      ready: Boolean(rendererCapability),
      capability: rendererCapability,
      sendCommand,
      jumpToResult: jumpToSearchResult,
      jumpToCfi,
      jumpToCfiRange,
      clearTemporaryHighlight,
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
      previousSessionGroups: previousLayers.previousAnnotationGroups,
      enablePreviousSession: previousLayers.togglePreviousSession,
    },
  });
}
