import type { ReaderSettings } from "../../storage/readerSettings";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ReadingSessionOrchestrator } from "./session/ReadingSessionOrchestrator";
import type { OpenedBook } from "./types";
import type { LibraryBook, SecondPassClient } from "@secondpass/client";
import { useReaderImportActivation } from "./imports/useReaderImportActivation";
import { useReaderImportJob } from "./imports/useReaderImportJob";
import { getReaderFontSizeScale } from "./settings/readerDisplaySettings";
import { useReaderDisplaySettings } from "./settings/useReaderDisplaySettings";
import type { CloseSessionAfterOption, CloseSessionInput } from "../sessions/CloseSessionDialog";
import { navigateTo } from "../../app/navigation";
import { findNextSeriesBook, normalizeSeriesIndex } from "../library/seriesUtils";
import { buildReturnLabel, saveReaderReturnTarget } from "./readerReturnTarget";
import { ReaderActivityDialogs } from "./activity/ReaderActivityDialogs";
import { ReaderActivityHeader } from "./activity/ReaderActivityHeader";
import { ReaderActivitySidePanels } from "./activity/ReaderActivitySidePanels";
import type { ReaderActivityRenderState, ReaderActivityWorkspaceFocusRequest } from "./activity/readerActivityTypes";

const READER_FINISH_PROGRESS_THRESHOLD = 0.95;

export function ReadingActivity({
  openedBook,
  onBackToLibrary,
  spl,
  settings,
  initialSearchQuery,
}: {
  openedBook: OpenedBook | null;
  onBackToLibrary: () => void;
  spl?: SecondPassClient | null;
  settings?: ReaderSettings;
  initialSearchQuery?: string | null;
}) {
  if (!openedBook) return <p className="muted">No book open.</p>;

  const [marginaliaOpen, setMarginaliaOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [endBookDialogOpen, setEndBookDialogOpen] = useState(false);
  const [workspaceFocusRequest, setWorkspaceFocusRequest] = useState<ReaderActivityWorkspaceFocusRequest | null>(null);
  const readerImport = useReaderImportJob();
  const readerDisplaySettings = useReaderDisplaySettings(settings);
  const displaySettings = readerDisplaySettings.settings;

  return (
    <div
      className="spReaderActivity"
      data-reader-theme={displaySettings.theme}
      data-reader-width={displaySettings.readerWidth}
      data-reader-line-height={displaySettings.lineHeight}
      data-reader-font-size={displaySettings.fontSizePercent}
      data-reader-font={displaySettings.fontFamily}
      style={{ "--sp-reader-font-scale": getReaderFontSizeScale(displaySettings) } as CSSProperties}
    >
      <ReadingSessionOrchestrator
        openedBook={openedBook}
        spl={spl}
        settings={displaySettings}
        onSettingsChange={readerDisplaySettings.updateSettings}
        onSettingsReset={readerDisplaySettings.resetSettings}
        onStagedSelectionCommitted={(source) => {
          if (source.kind !== "import") return;
          readerImport.markRowAccepted(source.importJobId, source.importRowId);
          readerImport.setDrawerOpen(true);
        }}
        onStagedSelectionCanceled={(source) => {
          if (source.kind !== "import") return;
          readerImport.markRowPending(source.importJobId, source.importRowId);
          readerImport.setDrawerOpen(true);
        }}
        onOpenAnnotationInWorkspace={(annotationId, mode) => {
          setWorkspaceFocusRequest((prev) => ({ annotationId, mode, seq: (prev?.seq ?? 0) + 1 }));
        }}
      >
        {(readerState) => (
          <ReaderActivityContent
            readerState={readerState}
            openedBook={openedBook}
            onBackToLibrary={onBackToLibrary}
            marginaliaOpen={marginaliaOpen}
            setMarginaliaOpen={setMarginaliaOpen}
            searchOpen={searchOpen}
            setSearchOpen={setSearchOpen}
            importModalOpen={importModalOpen}
            setImportModalOpen={setImportModalOpen}
            readerImport={readerImport}
            closeDialogOpen={closeDialogOpen}
            setCloseDialogOpen={setCloseDialogOpen}
            endBookDialogOpen={endBookDialogOpen}
            setEndBookDialogOpen={setEndBookDialogOpen}
            workspaceFocusRequest={workspaceFocusRequest}
            spl={spl}
            initialSearchQuery={initialSearchQuery}
          />
        )}
      </ReadingSessionOrchestrator>
    </div>
  );
}

function ReaderActivityContent({
  readerState,
  openedBook,
  onBackToLibrary,
  marginaliaOpen,
  setMarginaliaOpen,
  searchOpen,
  setSearchOpen,
  importModalOpen,
  setImportModalOpen,
  readerImport,
  closeDialogOpen,
  setCloseDialogOpen,
  endBookDialogOpen,
  setEndBookDialogOpen,
  workspaceFocusRequest,
  spl,
  initialSearchQuery,
}: {
  readerState: ReaderActivityRenderState;
  openedBook: OpenedBook;
  onBackToLibrary: () => void;
  marginaliaOpen: boolean;
  setMarginaliaOpen: (open: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  importModalOpen: boolean;
  setImportModalOpen: (open: boolean) => void;
  readerImport: ReturnType<typeof useReaderImportJob>;
  closeDialogOpen: boolean;
  setCloseDialogOpen: (open: boolean) => void;
  endBookDialogOpen: boolean;
  setEndBookDialogOpen: (open: boolean) => void;
  workspaceFocusRequest: { annotationId: string; mode: "editable" | "readonly"; seq: number } | null;
  spl?: SecondPassClient | null;
  initialSearchQuery?: string | null;
}) {
  const { state, statusLine, autosaveStatus, shell, annotations, marginalia } = readerState;
  const currentSessionId = state.sessionId;
  const shownEndBookSessionIdsRef = useRef<Set<string>>(new Set());
  const progress = state.location?.bookProgress;
  const nearEnd = typeof progress === "number" && Number.isFinite(progress) && progress >= READER_FINISH_PROGRESS_THRESHOLD;
  const showFinishControls = Boolean(currentSessionId && nearEnd);
  const canBookmark = Boolean(openedBook.readingOpen?.session?.id && state.location?.cfi);
  const isBookmarked = Boolean(state.location?.cfi && state.annotations.some((a) => a.kind === "bookmark" && a.cfi === state.location?.cfi));
  const selectedPreviousSessionIds = new Set(marginalia.selectedPreviousSessionIds);
  const [nextSeriesBook, setNextSeriesBook] = useState<LibraryBook | null>(null);
  const [nextSeriesStatus, setNextSeriesStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const activeReaderKey = `${openedBook.book.id}|${currentSessionId ?? ""}`;
  const seriesId = openedBook.book.series?.id;
  const currentSeriesIndex = normalizeSeriesIndex(openedBook.book.series_index);
  const coverBase = { apiBaseUrl: spl?.config.apiBaseUrl ?? null };
  const returnTarget = openedBook.returnTarget;
  const returnLabel = buildReturnLabel(returnTarget);
  const showHomeAction = returnTarget.kind !== "home";
  const canLookupNextBook = seriesId != null && currentSeriesIndex != null;
  const headerEndLabel = nextSeriesBook ? "Next book..." : "End options...";
  const importDrawerInLayout = Boolean(readerImport.drawerOpen && readerImport.job);
  const lastImportDrawerLayoutRef = useRef(importDrawerInLayout);
  const closeAfterOptions: CloseSessionAfterOption[] = [
    ...(nextSeriesBook ? [{ action: "nextBook" as const, label: "Start next book" }] : []),
    { action: "restartBook", label: "Start this book again" },
    { action: "home", label: returnLabel },
    { action: "detail", label: "View closed session" },
    { action: "sessions", label: "Go to sessions" },
  ];
  const activateImportRow = useReaderImportActivation({
    job: readerImport.job,
    searchBook: readerState.search.searchBook,
    stagedSelectionHandle: readerState.stagedSelection.handle,
    selectRow: readerImport.selectRow,
    setRowStatus: readerImport.setRowStatus,
    setRowActivationState: readerImport.setRowActivationState,
    setDrawerOpen: readerImport.setDrawerOpen,
    jumpToResult: readerState.search.jumpToCfi,
  });

  const clearImportJob = () => {
    readerState.stagedSelection.handle?.cancelStagedSelection();
    readerImport.clearJob();
  };

  const skipImportRow = (rowId: string) => {
    const row = readerImport.job?.rows.find((item) => item.id === rowId);
    if (row?.status === "staged") readerState.stagedSelection.handle?.cancelStagedSelection();
    readerImport.skipRow(rowId);
  };

  useEffect(() => {
    if (!initialSearchQuery?.trim()) return;
    setSearchOpen(true);
  }, [initialSearchQuery, setSearchOpen]);

  useEffect(() => {
    if (lastImportDrawerLayoutRef.current === importDrawerInLayout) return;
    lastImportDrawerLayoutRef.current = importDrawerInLayout;
    let cancelled = false;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!cancelled) readerState.sendCommand({ type: "resize" });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [importDrawerInLayout, readerState.sendCommand]);

  useEffect(() => {
    setEndBookDialogOpen(false);
    setCloseDialogOpen(false);
    setNextSeriesBook(null);
    setNextSeriesStatus("idle");
  }, [activeReaderKey, setCloseDialogOpen, setEndBookDialogOpen]);

  useEffect(() => {
    if (!currentSessionId || !state.location || !nearEnd || endBookDialogOpen || closeDialogOpen) return;
    if (shownEndBookSessionIdsRef.current.has(currentSessionId)) return;
    shownEndBookSessionIdsRef.current.add(currentSessionId);
    setEndBookDialogOpen(true);
  }, [closeDialogOpen, currentSessionId, endBookDialogOpen, nearEnd, setEndBookDialogOpen, state.location]);

  useEffect(() => {
    if (!showFinishControls || !spl || !canLookupNextBook) {
      setNextSeriesBook(null);
      setNextSeriesStatus("idle");
      return;
    }

    let cancelled = false;
    setNextSeriesBook(null);
    setNextSeriesStatus("loading");
    void (async () => {
      try {
        const books = await spl.library.series.books(String(seriesId), { ordering: "series_index", pageSize: 100 });
        if (cancelled) return;
        setNextSeriesBook(findNextSeriesBook(openedBook.book, books.results));
        setNextSeriesStatus("ready");
      } catch {
        if (!cancelled) {
          setNextSeriesBook(null);
          setNextSeriesStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canLookupNextBook, openedBook.book, seriesId, showFinishControls, spl]);

  const closeSession = async (input: CloseSessionInput) => {
    if (!currentSessionId) throw new Error("Missing session id.");
    await annotations.closeCurrentSession({ name: input.name, notes: input.notes });
    setCloseDialogOpen(false);
    if (input.afterAction === "nextBook" && nextSeriesBook) {
      saveReaderReturnTarget(nextSeriesBook.id, returnTarget);
      navigateTo({ kind: "reader", bookId: String(nextSeriesBook.id) });
    } else if (input.afterAction === "restartBook") {
      saveReaderReturnTarget(openedBook.book.id, returnTarget);
      navigateTo({ kind: "reader", bookId: String(openedBook.book.id) }, { replace: true });
      window.location.reload();
    } else if (input.afterAction === "home") {
      window.location.hash = returnTarget.route;
    } else if (input.afterAction === "sessions") {
      navigateTo({ kind: "sessions" });
    } else {
      navigateTo({ kind: "session", sessionId: currentSessionId });
    }
  };

  const startNextBook = (book: LibraryBook) => {
    setEndBookDialogOpen(false);
    setCloseDialogOpen(false);
    saveReaderReturnTarget(book.id, returnTarget);
    navigateTo({ kind: "reader", bookId: String(book.id) });
  };

  const finishCurrentSession = () => {
    setEndBookDialogOpen(false);
    setCloseDialogOpen(true);
  };

  return (
    <>
      <ReaderActivityHeader
        title={openedBook.book.title}
        statusLine={statusLine}
        autosaveStatus={autosaveStatus}
        showFinishControls={showFinishControls}
        headerEndLabel={headerEndLabel}
        nextBookAvailable={Boolean(nextSeriesBook)}
        onOpenEndBookDialog={() => setEndBookDialogOpen(true)}
        searchOpen={searchOpen}
        onToggleSearch={() => setSearchOpen(!searchOpen)}
        searchReady={readerState.search.ready}
        canBookmark={canBookmark}
        isBookmarked={isBookmarked}
        annotationBusy={Boolean(annotations.busy)}
        onToggleBookmark={() => {
          void annotations.toggleBookmarkAtCurrentLocation();
        }}
        marginaliaOpen={marginaliaOpen}
        onOpenMarginalia={() => setMarginaliaOpen(true)}
        onCloseMarginalia={() => setMarginaliaOpen(false)}
        marginalia={marginalia}
        selectedPreviousSessionIds={selectedPreviousSessionIds}
        importJobActive={Boolean(readerImport.job)}
        onImportMarginalia={() => setImportModalOpen(true)}
        onOpenImport={() => readerImport.setDrawerOpen(true)}
        onCloseSession={currentSessionId ? () => setCloseDialogOpen(true) : undefined}
        returnLabel={returnLabel}
        onReturn={() => {
          window.location.hash = returnTarget.route;
        }}
        showHomeAction={showHomeAction}
        onHome={onBackToLibrary}
      />

      <ReaderActivitySidePanels
        importDrawerInLayout={importDrawerInLayout}
        shell={shell}
        annotations={annotations}
        currentCfi={state.location?.cfi ?? null}
        workspaceFocusRequest={workspaceFocusRequest}
        onJumpToCfi={readerState.search.jumpToCfi}
        onJumpToCfiRange={readerState.search.jumpToCfiRange}
        readerImport={readerImport}
        onClearImport={clearImportJob}
        onSelectImportRow={(rowId) => {
          void activateImportRow(rowId);
        }}
        onSkipImportRow={skipImportRow}
      />

      <ReaderActivityDialogs
        bookId={openedBook.book.id}
        bookTitle={openedBook.book.title}
        searchOpen={searchOpen}
        search={readerState.search}
        initialSearchQuery={initialSearchQuery}
        onCloseSearch={() => {
          readerState.search.clearTemporaryHighlight();
          setSearchOpen(false);
        }}
        importModalOpen={importModalOpen}
        onCloseImportModal={() => setImportModalOpen(false)}
        onStartImport={readerImport.startImport}
        onParseImportAction={(action) => {
          setImportModalOpen(false);
          if (action.href === "#/settings?tab=tools") navigateTo({ kind: "settings", tab: "tools" });
          else window.location.hash = action.href;
        }}
        closeDialogOpen={closeDialogOpen}
        closeInitialName={annotations.currentSessionMeta.name ?? ""}
        closeInitialNotes={annotations.currentSessionMeta.notes ?? ""}
        closeAfterOptions={closeAfterOptions}
        defaultAfterAction={nextSeriesBook ? "nextBook" : "home"}
        nextBook={nextSeriesBook}
        coverBase={coverBase}
        onCancelCloseSession={() => setCloseDialogOpen(false)}
        onSaveAndCloseSession={closeSession}
        endBookDialogOpen={endBookDialogOpen}
        nextBookStatus={nextSeriesStatus}
        hasSeries={Boolean(canLookupNextBook)}
        onStartNextBook={startNextBook}
        onFinishSession={finishCurrentSession}
        onKeepReading={() => setEndBookDialogOpen(false)}
        onGoToLibrary={nextSeriesBook ? undefined : () => {
          window.location.hash = returnTarget.route;
        }}
        returnLabel={returnLabel}
      />
    </>
  );
}
