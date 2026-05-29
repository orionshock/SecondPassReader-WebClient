import type { LibraryBook } from "@secondpass/client";
import type { ReaderSettings } from "../../storage/readerSettings";
import { AnnotationList } from "./annotations/AnnotationList";
import { ReadingSessionOrchestrator } from "./session/ReadingSessionOrchestrator";
import type { OpenedBook } from "./types";
import type { ReaderTocItem } from "./domain/types";

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
        {({ state, shell, debugPanel, sendCommand }) => (
          <div className="spReaderLayout">
            <div className="spReaderViewportRegion">{shell}</div>
            {state.toc && state.toc.length > 0 ? (
              <section className="panel spReaderTocPanel">
                <h2 className="panelTitle">Contents (temporary)</h2>
                <select
                  className="input"
                  defaultValue=""
                  onChange={(e) => {
                    const href = e.currentTarget.value;
                    if (!href) return;
                    sendCommand({ type: "display", target: { type: "href", href } });
                    e.currentTarget.value = "";
                  }}
                >
                  <option value="">Jump to…</option>
                  {flattenToc(state.toc).map((item) => (
                    <option key={item.href} value={item.href}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </section>
            ) : null}
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

function flattenToc(toc: ReaderTocItem[]): Array<{ label: string; href: string }> {
  const out: Array<{ label: string; href: string }> = [];
  const visit = (items: ReaderTocItem[], depth: number) => {
    for (const item of items) {
      if (item.href) {
        const prefix = depth > 0 ? `${"  ".repeat(depth)}- ` : "";
        out.push({ label: `${prefix}${item.label}`, href: item.href });
      }
      if (item.children && item.children.length > 0) visit(item.children, depth + 1);
    }
  };
  visit(toc, 0);
  return out;
}
