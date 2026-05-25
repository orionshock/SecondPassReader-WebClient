import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReadingOpenResponse } from "../../schemas/readingSession";
import type { LibraryBook } from "../../schemas/library";
import type { ReaderSettings } from "../../storage/readerSettings";
import { getReaderSettings, normalizeReaderSettings, saveReaderSettings } from "../../storage/readerSettings";
import { navigateTo } from "../../app/navigation";
import { AnnotationPanel } from "./AnnotationPanel";
import { EpubReaderPanel } from "./EpubReaderPanel";
import { NearEndBanner } from "./NearEndBanner";
import { ProgressPanel } from "./ProgressPanel";
import { ReaderSettingsPanel } from "./ReaderSettingsPanel";
import type { ReaderLocation, OpenedBook } from "./types";
import { useProgressAutosave } from "./useProgressAutosave";
import { useNearEndLifecycle } from "./useNearEndLifecycle";
import { useReaderAnnotations } from "./useReaderAnnotations";

export function ReaderArea({
  openedBook,
  onBackToLibrary,
  apiBaseUrl,
  accessToken,
  tokenType,
  onOpenBook,
}: {
  openedBook: OpenedBook | null;
  onBackToLibrary: () => void;
  apiBaseUrl?: string;
  accessToken?: string;
  tokenType?: string;
  onOpenBook?: (book: LibraryBook) => Promise<void>;
}) {
  const PROGRESS_AUTOSAVE_DELAY_MS = 5000;
  const DEBUG_PROGRESS = import.meta.env.DEV;

  const [locationString, setLocationString] = useState<string | null>(null);
  const [readerLocation, setReaderLocation] = useState<ReaderLocation | null>(null);
  const [goToStartSignal, setGoToStartSignal] = useState(0);

  const [readerSettings, setReaderSettings] = useState(() => getReaderSettings());
  const [readerSettingsOpen, setReaderSettingsOpen] = useState(false);

  const readerThemeClass =
    readerSettings.theme === "dark" ? "readerThemeDark" : readerSettings.theme === "sepia" ? "readerThemeSepia" : "readerThemeLight";
  const readerWidthClass =
    readerSettings.readerWidth === "narrow"
      ? "readerWidthNarrow"
      : readerSettings.readerWidth === "wide"
        ? "readerWidthWide"
        : "readerWidthNormal";

  const handleReaderSettingsChange = useCallback((next: ReaderSettings) => {
    const normalized = normalizeReaderSettings(next);
    setReaderSettings(normalized);
    saveReaderSettings(normalized);
  }, []);

  useEffect(() => {
    setLocationString(null);
    setReaderLocation(null);
  }, [openedBook?.objectUrl]);

  const [readingOpenState, setReadingOpenState] = useState<ReadingOpenResponse | null>(openedBook?.readingOpen ?? null);

  useEffect(() => {
    setReadingOpenState(openedBook?.readingOpen ?? null);
  }, [openedBook?.objectUrl]);

  const readingOpen: ReadingOpenResponse | null = readingOpenState;
  const sessionId = readingOpen?.session?.id ?? null;
  const effectiveProfileVersion = readingOpen?.profile_version ?? "0.1.0";

  useEffect(() => {
    if (!DEBUG_PROGRESS) return;
    // eslint-disable-next-line no-console
    console.log("[progress] sessionId changed", {
      sessionId,
      bookId: openedBook?.book?.id,
    });
  }, [DEBUG_PROGRESS, openedBook?.book?.id, sessionId]);

  const annotations = useReaderAnnotations({
    openedBookKey: openedBook?.objectUrl ?? null,
    readingOpen,
    apiBaseUrl,
    accessToken,
    tokenType,
    sessionId,
    profileVersion: effectiveProfileVersion,
  });

  const authors = useMemo(
    () => (openedBook?.book.authors ?? []).map((a) => a.name).filter(Boolean).join(", "),
    [openedBook?.book.authors],
  );
  const seriesLine = useMemo(() => {
    const seriesName = openedBook?.book.series?.name;
    const idx = openedBook?.book.series_index;
    if (!seriesName) return null;
    if (idx === null || idx === undefined || idx === "") return seriesName;
    return `${seriesName} #${idx}`;
  }, [openedBook?.book.series?.name, openedBook?.book.series_index]);

  const initialCfi =
    readingOpen?.progress?.current_location?.cfi ?? readingOpen?.progress?.current_location?.selector?.value ?? null;

  const currentCfi = readerLocation?.cfi ?? locationString;
  const currentHref = readerLocation?.href;
  const currentProgression = readerLocation?.progression ?? null;

  const { autosave, resetForSessionSwap } = useProgressAutosave({
    apiBaseUrl,
    accessToken,
    tokenType,
    sessionId,
    profileVersion: effectiveProfileVersion,
    openedBookKey: openedBook?.objectUrl ?? null,
    initialCfi,
    currentCfi,
    currentHref,
    currentProgression,
    autosaveDelayMs: PROGRESS_AUTOSAVE_DELAY_MS,
    debug: DEBUG_PROGRESS,
  });

  const nearEndProgressSaved =
    !autosave.enabled ||
    autosave.status === "error" ||
    (autosave.lastAutosavedCfi != null && currentCfi != null && autosave.lastAutosavedCfi === currentCfi);

  const nearEnd = useNearEndLifecycle({
    openedBook,
    currentProgression,
    nearEndProgressSaved,
    sessionId,
    apiBaseUrl,
    accessToken,
    tokenType,
    onOpenBook,
    debug: DEBUG_PROGRESS,
    readingOpenReplace: (next) => setReadingOpenState(next),
    clearLocalReaderState: () => {
      setLocationString(null);
      setReaderLocation(null);
      annotations.clearLocalState();
    },
    bumpGoToStartSignal: () => setGoToStartSignal((v) => v + 1),
    resetAutosaveForSessionSwap: (nextSessionId) => resetForSessionSwap(nextSessionId),
  });

  if (!openedBook) return <p className="muted">No book open. Select a book from the library.</p>;

  const loadedServerAnnotations = annotations.loadedServerAnnotations;

  return (
    <div className={`readerArea ${readerThemeClass} ${readerWidthClass}`}>
      <div className="readerTopBar">
        <div className="readerTopLeft">
          <div className="readerBookTitle">{openedBook.book.title}</div>
          <div className="readerBookSubtitle muted">
            {seriesLine ? <span>{seriesLine}</span> : null}
            {seriesLine && authors ? <span className="sep"> {"\u00B7"} </span> : null}
            {authors ? <span>{authors}</span> : null}
          </div>
        </div>
        <div className="readerTopRight">
          <button
            type="button"
            className="button buttonCompact"
            onClick={() => setReaderSettingsOpen((v) => !v)}
          >
            Reader settings
          </button>
          <button
            type="button"
            className="button buttonCompact"
            onClick={() => {
              // Avoid relying on browser history navigation; always return to the app's home route.
              // eslint-disable-next-line no-console
              console.log("[nav] Home clicked (ReaderArea)");
              navigateTo({ kind: "home" });
              onBackToLibrary();
            }}
          >
            Home
          </button>
        </div>
      </div>

      {readerSettingsOpen ? <ReaderSettingsPanel settings={readerSettings} onChange={handleReaderSettingsChange} /> : null}

      <ProgressPanel
        autosave={autosave}
        currentHref={currentHref}
        progression={currentProgression}
      />

      {nearEnd.shouldShowNearEndBanner ? (
        <NearEndBanner
          closeSessionFirst={nearEnd.closeSessionFirst}
          disabled={nearEnd.closeSessionFirst}
          nextBookDisabled={!nearEnd.canResolveNextBook || !onOpenBook}
          nextBookBusy={nearEnd.nextBookBusy}
          message={nearEnd.nearEndMessage}
          onToggleCloseSessionFirst={nearEnd.onToggleCloseSessionFirst}
          onGoToStart={() => {
            void nearEnd.handleGoToStart();
          }}
          onNextBook={() => {
            void nearEnd.handleNextBook();
          }}
          onResume={nearEnd.handleResumeNearEnd}
        />
      ) : null}

      {annotations.pendingSelection ? (
        <div className="annotationFloat">
          <div className="annotationFloatTitle">Selection</div>
          <div className="annotationFloatText mono">{annotations.selectionPreview || "(no text captured)"}</div>

          {!annotations.noteOpen ? (
            <div className="annotationFloatActions">
              <button
                type="button"
                className="button buttonPrimary buttonCompact"
                onClick={annotations.createHighlightFromPending}
              >
                Highlight
              </button>
              <button type="button" className="button buttonCompact" onClick={() => annotations.setNoteOpen(true)}>
                Add note
              </button>
              <button
                type="button"
                className="button buttonCompact"
                onClick={annotations.cancelPendingSelection}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="annotationFloatNote">
              <textarea
                className="input"
                rows={3}
                value={annotations.noteDraft}
                onChange={(e) => annotations.setNoteDraft(e.target.value)}
                placeholder="Note..."
              />
              <div className="annotationFloatActions">
                <button
                  type="button"
                  className="button buttonPrimary buttonCompact"
                  onClick={annotations.createNoteFromPending}
                >
                  Save note
                </button>
                <button
                  type="button"
                  className="button buttonCompact"
                  onClick={annotations.cancelPendingSelection}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      <EpubReaderPanel
        blob={openedBook.blob}
        highlights={annotations.highlights}
        initialLocation={initialCfi ?? undefined}
        goToStartSignal={goToStartSignal}
        settings={readerSettings}
        onLocationChanged={setLocationString}
        onReaderLocationChange={setReaderLocation}
        onHighlightClicked={annotations.setSelectedHighlightId}
        onTextSelected={(sel) => {
          annotations.onTextSelected(sel);
        }}
      />

      <AnnotationPanel
        highlights={annotations.highlights}
        selectedId={annotations.selectedHighlightId}
        onSelect={annotations.setSelectedHighlightId}
        onRemoveLocal={annotations.removeLocalAnnotation}
        onSaveToSession={(id) => void annotations.saveHighlightToSession(id)}
        onDeleteFromSession={(id) => void annotations.deleteHighlightFromSession(id)}
        onUpdateNote={(id, note) => void annotations.updateSavedAnnotationNote(id, note)}
        serverPageInfo={annotations.serverPageInfo ? { ...annotations.serverPageInfo, loaded: loadedServerAnnotations } : null}
        onLoadMoreSavedAnnotations={() => void annotations.loadMoreSavedAnnotations()}
        readingOpen={readingOpen}
        book={openedBook.book}
        apiReady={Boolean(apiBaseUrl && accessToken)}
      />
    </div>
  );
}
