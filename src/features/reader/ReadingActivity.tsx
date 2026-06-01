import type { ReaderSettings } from "../../storage/readerSettings";
import { useState } from "react";
import { AnnotationWorkspace } from "./annotations/AnnotationWorkspace";
import { ReadingSessionOrchestrator } from "./session/ReadingSessionOrchestrator";
import type { OpenedBook } from "./types";
import type { SecondPassClient } from "@secondpass/client";
import { MaterialIcon } from "../../components/MaterialIcon";
import { MarginaliaMenu } from "./shell/MarginaliaMenu";

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

  return (
    <div className="spReaderActivity">
      <ReadingSessionOrchestrator openedBook={openedBook} spl={spl} settings={settings}>
        {({ state, statusLine, autosaveStatus, shell, annotations, marginalia }) => {
          const canBookmark = Boolean(openedBook.readingOpen?.session?.id && openedBook.readingOpen?.profile_version && state.location?.cfi);
          const isBookmarked = Boolean(state.location?.cfi && state.annotations.some((a) => a.kind === "bookmark" && a.cfi === state.location?.cfi));
          const selectedPreviousSessionIds = new Set(marginalia.selectedPreviousSessionIds);

          return (
            <>
              <div className="spReaderChrome">
                <div className="spReaderTopBar">
                  <div className="spReaderTitle">
                    <div className="spReaderTitleLine">{openedBook.book.title}</div>
                    {statusLine ? <div className="spReaderStatusLine muted">{statusLine}</div> : null}
                    {autosaveStatus ? (
                      <div className="spReaderAutosaveLine muted" title={autosaveStatus.title}>
                        {autosaveStatus.text}
                      </div>
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
                      previousLayers={marginalia.previousLayers}
                      selectedPreviousSessionIds={selectedPreviousSessionIds}
                      onTogglePreviousSession={marginalia.togglePreviousSession}
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
                    state={state}
                    annotations={annotations.items}
                    status={annotations.status}
                    error={annotations.error}
                    busy={annotations.busy}
                    currentCfi={state.location?.cfi ?? null}
                    onRemoveAnnotation={(annotationId) => {
                      void annotations.removeById(annotationId);
                    }}
                    onUpdateHighlight={(annotationId, update) => annotations.updateHighlight(annotationId, update)}
                  />
                </div>
              </div>
            </>
          );
        }}
      </ReadingSessionOrchestrator>
    </div>
  );
}
