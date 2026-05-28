import type { LibraryBook } from "@secondpass/client";
import type { ReaderSettings } from "../../storage/readerSettings";
import { AnnotationList } from "./annotations/AnnotationList";
import { ReadingSessionOrchestrator } from "./session/ReadingSessionOrchestrator";
import type { OpenedBook } from "./types";

export function ReadingActivity({
  openedBook,
  onBackToLibrary,
  apiBaseUrl,
  accessToken,
  tokenType,
  onOpenBook,
  settings,
}: {
  openedBook: OpenedBook | null;
  onBackToLibrary: () => void;
  apiBaseUrl?: string;
  accessToken?: string;
  tokenType?: string;
  onOpenBook?: (book: LibraryBook) => Promise<void>;
  settings?: ReaderSettings;
}) {
  if (!openedBook) return <p className="muted">No book open.</p>;

  return (
    <div className="spReaderActivity">
      <div className="spReaderTopBar">
        <div className="spReaderTitle">
          <div className="spReaderTitleLine">{openedBook.book.title}</div>
          <div className="spReaderSubtitle muted">SecondPass Reader rebuild placeholder (epub-ts)</div>
        </div>
        <div className="spReaderActions">
          <button type="button" className="button buttonCompact" onClick={onBackToLibrary}>
            Back
          </button>
        </div>
      </div>

      <ReadingSessionOrchestrator openedBook={openedBook} apiBaseUrl={apiBaseUrl} accessToken={accessToken} tokenType={tokenType} settings={settings}>
        {({ state, shell, debugPanel }) => (
          <div className="spReaderLayout">
            <div className="spReaderViewportRegion">{shell}</div>
            <div className="spReaderAnnotationsRegion">
              <AnnotationList state={state} onOpenBook={onOpenBook} />
            </div>
            <div className="spReaderDebugRegion">{debugPanel}</div>
          </div>
        )}
      </ReadingSessionOrchestrator>
    </div>
  );
}
