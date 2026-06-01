import type { ReaderSettings } from "../../storage/readerSettings";
import { AnnotationWorkspace } from "./annotations/AnnotationWorkspace";
import { ReadingSessionOrchestrator } from "./session/ReadingSessionOrchestrator";
import type { OpenedBook } from "./types";
import type { SecondPassClient } from "@secondpass/client";

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

  return (
    <div className="spReaderActivity">
      <div className="spReaderTopBar">
        <div className="spReaderTitle">
          <div className="spReaderTitleLine">{openedBook.book.title}</div>
        </div>
        <div className="spReaderActions">
          <button type="button" className="button buttonCompact" onClick={onBackToLibrary}>
            Back
          </button>
        </div>
      </div>

      <ReadingSessionOrchestrator openedBook={openedBook} spl={spl} settings={settings}>
        {({ state, shell, annotations }) => (
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
        )}
      </ReadingSessionOrchestrator>
    </div>
  );
}
