import type { ReaderSettings } from "../../storage/readerSettings";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { AnnotationWorkspace } from "./annotations/AnnotationWorkspace";
import { ReadingSessionOrchestrator } from "./session/ReadingSessionOrchestrator";
import type { ReadingSessionOrchestratorProps } from "./session/ReadingSessionOrchestrator";
import type { OpenedBook } from "./types";
import type { SecondPassClient } from "@secondpass/client";
import { MaterialIcon } from "../../components/MaterialIcon";
import { InlineMeta } from "../../components/MetaSeparator";
import { MarginaliaMenu } from "./shell/MarginaliaMenu";
import { getReaderFontSizeScale } from "./settings/readerDisplaySettings";
import { useReaderDisplaySettings } from "./settings/useReaderDisplaySettings";
import { CloseSessionDialog, type CloseSessionInput } from "../sessions/CloseSessionDialog";
import { navigateTo } from "../../app/navigation";

const READER_FINISH_PROGRESS_THRESHOLD = 0.95;
type ReaderActivityRenderState = Parameters<ReadingSessionOrchestratorProps["children"]>[0];

export function ReadingActivity({
  openedBook,
  onBackToLibrary,
  spl,
  settings,
}: {
  openedBook: OpenedBook | null;
  onBackToLibrary: () => void;
  spl?: SecondPassClient | null;
  settings?: ReaderSettings;
}) {
  if (!openedBook) return <p className="muted">No book open.</p>;

  const [marginaliaOpen, setMarginaliaOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
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
            closeDialogOpen={closeDialogOpen}
            setCloseDialogOpen={setCloseDialogOpen}
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
  closeDialogOpen,
  setCloseDialogOpen,
}: {
  readerState: ReaderActivityRenderState;
  openedBook: OpenedBook;
  onBackToLibrary: () => void;
  marginaliaOpen: boolean;
  setMarginaliaOpen: (open: boolean) => void;
  closeDialogOpen: boolean;
  setCloseDialogOpen: (open: boolean) => void;
}) {
  const { state, statusLine, autosaveStatus, shell, annotations, marginalia } = readerState;
  const currentSessionId = state.sessionId;
  const shownFinishSessionIdsRef = useRef<Set<string>>(new Set());
  const progress = state.location?.bookProgress;
  const nearEnd = typeof progress === "number" && Number.isFinite(progress) && progress >= READER_FINISH_PROGRESS_THRESHOLD;
  const showFinishControls = Boolean(currentSessionId && nearEnd);
  const canBookmark = Boolean(openedBook.readingOpen?.session?.id && openedBook.readingOpen?.profile_version && state.location?.cfi);
  const isBookmarked = Boolean(state.location?.cfi && state.annotations.some((a) => a.kind === "bookmark" && a.cfi === state.location?.cfi));
  const selectedPreviousSessionIds = new Set(marginalia.selectedPreviousSessionIds);

  useEffect(() => {
    if (!currentSessionId || !nearEnd || closeDialogOpen) return;
    if (shownFinishSessionIdsRef.current.has(currentSessionId)) return;
    shownFinishSessionIdsRef.current.add(currentSessionId);
    setCloseDialogOpen(true);
  }, [closeDialogOpen, currentSessionId, nearEnd, setCloseDialogOpen]);

  const closeSession = async (input: CloseSessionInput) => {
    if (!currentSessionId) throw new Error("Missing session id.");
    await annotations.closeCurrentSession({ name: input.name, notes: input.notes });
    setCloseDialogOpen(false);
    if (input.afterAction === "sessions") navigateTo({ kind: "sessions" });
    else navigateTo({ kind: "session", sessionId: currentSessionId });
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
                onClick={() => setCloseDialogOpen(true)}
              >
                <MaterialIcon name="flag" />
                <span className="spIconButtonLabel">Finish…</span>
              </button>
            ) : null}
          </div>

          <div className="spReaderActions">
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
              onClick={onBackToLibrary}
              aria-label="Home"
              title="Home"
            >
              <MaterialIcon name="home" />
              <span className="spIconButtonLabel">Home</span>
            </button>
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

      {closeDialogOpen ? (
        <CloseSessionDialog
          initialName={annotations.currentSessionMeta.name ?? ""}
          initialNotes={annotations.currentSessionMeta.notes ?? ""}
          onCancel={() => setCloseDialogOpen(false)}
          onSaveAndClose={closeSession}
        />
      ) : null}
    </>
  );
}
