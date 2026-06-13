import type { ReaderSettings } from "../../storage/readerSettings";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { AnnotationWorkspace } from "./annotations/AnnotationWorkspace";
import { ReadingSessionOrchestrator } from "./session/ReadingSessionOrchestrator";
import type { ReadingSessionOrchestratorProps } from "./session/ReadingSessionOrchestrator";
import type { OpenedBook } from "./types";
import type { LibraryBook, SecondPassClient } from "@secondpass/client";
import { MaterialIcon } from "../../components/MaterialIcon";
import { InlineMeta } from "../../components/MetaSeparator";
import { MarginaliaMenu } from "./shell/MarginaliaMenu";
import { BookSearchDrawer } from "./shell/bookSearch/BookSearchDrawer";
import { EndOfBookDialog } from "./EndOfBookDialog";
import { getReaderFontSizeScale } from "./settings/readerDisplaySettings";
import { useReaderDisplaySettings } from "./settings/useReaderDisplaySettings";
import { CloseSessionDialog, type CloseSessionAfterOption, type CloseSessionInput } from "../sessions/CloseSessionDialog";
import { navigateTo } from "../../app/navigation";
import { findNextSeriesBook, normalizeSeriesIndex } from "../library/seriesUtils";
import { buildReturnLabel, saveReaderReturnTarget } from "./readerReturnTarget";

const READER_FINISH_PROGRESS_THRESHOLD = 0.95;
type ReaderActivityRenderState = Parameters<ReadingSessionOrchestratorProps["children"]>[0];

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
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [endBookDialogOpen, setEndBookDialogOpen] = useState(false);
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
            closeDialogOpen={closeDialogOpen}
            setCloseDialogOpen={setCloseDialogOpen}
            endBookDialogOpen={endBookDialogOpen}
            setEndBookDialogOpen={setEndBookDialogOpen}
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
  closeDialogOpen,
  setCloseDialogOpen,
  endBookDialogOpen,
  setEndBookDialogOpen,
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
  closeDialogOpen: boolean;
  setCloseDialogOpen: (open: boolean) => void;
  endBookDialogOpen: boolean;
  setEndBookDialogOpen: (open: boolean) => void;
  spl?: SecondPassClient | null;
  initialSearchQuery?: string | null;
}) {
  const { state, statusLine, autosaveStatus, shell, annotations, marginalia } = readerState;
  const currentSessionId = state.sessionId;
  const shownEndBookSessionIdsRef = useRef<Set<string>>(new Set());
  const progress = state.location?.bookProgress;
  const nearEnd = typeof progress === "number" && Number.isFinite(progress) && progress >= READER_FINISH_PROGRESS_THRESHOLD;
  const showFinishControls = Boolean(currentSessionId && nearEnd);
  const canBookmark = Boolean(openedBook.readingOpen?.session?.id && openedBook.readingOpen?.profile_version && state.location?.cfi);
  const isBookmarked = Boolean(state.location?.cfi && state.annotations.some((a) => a.kind === "bookmark" && a.cfi === state.location?.cfi));
  const selectedPreviousSessionIds = new Set(marginalia.selectedPreviousSessionIds);
  const [nextSeriesBook, setNextSeriesBook] = useState<LibraryBook | null>(null);
  const [nextSeriesStatus, setNextSeriesStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const seriesId = openedBook.book.series?.id;
  const currentSeriesIndex = normalizeSeriesIndex(openedBook.book.series_index);
  const coverBase = { apiBaseUrl: spl?.config.apiBaseUrl ?? null };
  const returnTarget = openedBook.returnTarget;
  const returnLabel = buildReturnLabel(returnTarget);
  const showHomeAction = returnTarget.kind !== "home";
  const canLookupNextBook = seriesId != null && currentSeriesIndex != null;
  const headerEndLabel = nextSeriesBook ? "Next book…" : "End options…";
  const closeAfterOptions: CloseSessionAfterOption[] = [
    ...(nextSeriesBook ? [{ action: "nextBook" as const, label: "Start next book" }] : []),
    { action: "restartBook", label: "Start this book again" },
    { action: "home", label: returnLabel },
    { action: "detail", label: "View closed session" },
    { action: "sessions", label: "Go to sessions" },
  ];

  useEffect(() => {
    if (!initialSearchQuery?.trim()) return;
    setSearchOpen(true);
  }, [initialSearchQuery, setSearchOpen]);

  useEffect(() => {
    if (!currentSessionId || !nearEnd || endBookDialogOpen || closeDialogOpen) return;
    if (shownEndBookSessionIdsRef.current.has(currentSessionId)) return;
    shownEndBookSessionIdsRef.current.add(currentSessionId);
    setEndBookDialogOpen(true);
  }, [closeDialogOpen, currentSessionId, endBookDialogOpen, nearEnd, setEndBookDialogOpen]);

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
      <div className="spReaderChrome">
        <div className="spReaderTopBar">
          <div className="spReaderTitle">
            <div className="spReaderTitleLine">{openedBook.book.title}</div>
            {statusLine.length ? <div className="spReaderStatusLine muted"><InlineMeta items={statusLine} /></div> : null}
            {autosaveStatus ? (
              <div className="spReaderAutosaveLine muted" title={autosaveStatus.title}>
                {autosaveStatus.text}
              </div>
            ) : null}
          </div>

          <div className="spReaderContextActions" aria-label="Session completion actions">
            {showFinishControls ? (
              <button
                type="button"
                className="button buttonCompact spIconButton"
                onClick={() => setEndBookDialogOpen(true)}
              >
                <MaterialIcon name={nextSeriesBook ? "arrow_forward" : "flag"} />
                <span className="spIconButtonLabel">{headerEndLabel}</span>
              </button>
            ) : null}
          </div>

          <div className="spReaderActions">
            <button
              type="button"
              className="button buttonCompact spIconButton"
              onClick={() => setSearchOpen(!searchOpen)}
              disabled={!readerState.search.ready}
              aria-label={searchOpen ? "Close book search" : "Search in book"}
              title={readerState.search.ready ? "Search in book" : "Search is unavailable until the reader is ready."}
              aria-pressed={searchOpen}
            >
              <MaterialIcon name="search" />
              <span className="spIconButtonLabel">Search</span>
            </button>

            <button
              type="button"
              className="button buttonCompact spIconButton"
              onClick={() => {
                void annotations.toggleBookmarkAtCurrentLocation();
              }}
              disabled={!canBookmark || Boolean(annotations.busy)}
              title={!canBookmark ? "Bookmark is unavailable until a reading location is known." : "Bookmark"}
              aria-label={isBookmarked ? "Remove bookmark" : "Add bookmark"}
            >
              <MaterialIcon name={isBookmarked ? "bookmark_added" : "bookmark_add"} />
              <span className="spIconButtonLabel">{isBookmarked ? "Bookmarked" : "Bookmark"}</span>
            </button>

            <MarginaliaMenu
              open={marginaliaOpen}
              onOpen={() => setMarginaliaOpen(true)}
              onClose={() => setMarginaliaOpen(false)}
              listStatus={marginalia.listStatus}
              listError={marginalia.listError}
              previousLayers={marginalia.previousLayers}
              selectedPreviousSessionIds={selectedPreviousSessionIds}
              onTogglePreviousSession={marginalia.togglePreviousSession}
              onCloseSession={currentSessionId ? () => setCloseDialogOpen(true) : undefined}
            />

            <button
              type="button"
              className="button buttonCompact spIconButton"
              onClick={() => {
                window.location.hash = returnTarget.route;
              }}
              aria-label={returnLabel}
              title={returnLabel}
            >
              <MaterialIcon name="arrow_back" />
              <span className="spIconButtonLabel">{returnLabel}</span>
            </button>
            {showHomeAction ? (
              <button
                type="button"
                className="button buttonCompact spIconButton"
                onClick={onBackToLibrary}
                aria-label="Home"
                title="Home"
              >
                <MaterialIcon name="home" />
                <span className="spIconButtonLabel">Home</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="spReaderLayout">
        <div className="spReaderViewportRegion">{shell}</div>
        <div className="spReaderAnnotationsRegion">
          <AnnotationWorkspace
            annotations={annotations.items}
            status={annotations.status}
            error={annotations.error}
            busy={annotations.busy}
            currentCfi={state.location?.cfi ?? null}
            previousSessionGroups={annotations.previousSessionGroups}
            onEnablePreviousSession={annotations.enablePreviousSession}
            currentSessionMeta={annotations.currentSessionMeta}
            onUpdateCurrentSessionMeta={annotations.updateCurrentSessionMeta}
            onRemoveAnnotation={(annotationId) => {
              void annotations.removeById(annotationId);
            }}
            onUpdateHighlight={(annotationId, update) => annotations.updateHighlight(annotationId, update)}
          />
        </div>
      </div>

      <BookSearchDrawer
        key={String(openedBook.book.id)}
        open={searchOpen}
        ready={readerState.search.ready}
        searchBook={readerState.search.searchBook}
        bookTitle={openedBook.book.title}
        initialSearchQuery={initialSearchQuery}
        onClose={() => {
          readerState.search.clearTemporaryHighlight();
          setSearchOpen(false);
        }}
        onJump={(result) => {
          readerState.search.jumpToResult(result.cfi);
        }}
      />

      {closeDialogOpen ? (
        <CloseSessionDialog
          initialName={annotations.currentSessionMeta.name ?? ""}
          initialNotes={annotations.currentSessionMeta.notes ?? ""}
          afterOptions={closeAfterOptions}
          defaultAfterAction={nextSeriesBook ? "nextBook" : "home"}
          nextBook={nextSeriesBook}
          coverBase={coverBase}
          onCancel={() => setCloseDialogOpen(false)}
          onSaveAndClose={closeSession}
        />
      ) : null}

      {endBookDialogOpen ? (
        <EndOfBookDialog
          nextBook={nextSeriesBook}
          nextBookStatus={nextSeriesStatus}
          coverBase={coverBase}
          hasSeries={Boolean(canLookupNextBook)}
          onStartNextBook={startNextBook}
          onFinishSession={finishCurrentSession}
          onKeepReading={() => setEndBookDialogOpen(false)}
          onGoToLibrary={nextSeriesBook ? undefined : () => {
            window.location.hash = returnTarget.route;
          }}
          returnLabel={returnLabel}
        />
      ) : null}
    </>
  );
}
