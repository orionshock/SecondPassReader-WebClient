import type { ReaderSettings } from "../../storage/readerSettings";
import { AnnotationWorkspace } from "./annotations/AnnotationWorkspace";
import { ReadingSessionOrchestrator } from "./session/ReadingSessionOrchestrator";
import type { OpenedBook } from "./types";
import type { ReaderTocItem } from "./domain/types";
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
        {({ state, shell, sendCommand, annotations }) => (
          <div className="spReaderLayout">
            <div className="spReaderViewportRegion">{shell}</div>
            {state.toc && state.toc.length > 0 ? (
              <section className="panel spReaderTocPanel">
                <h2 className="panelTitle">Contents</h2>
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
              <AnnotationWorkspace
                state={state}
                annotations={annotations.items}
                status={annotations.status}
                error={annotations.error}
                busy={annotations.busy}
                currentCfi={state.location?.cfi ?? null}
                onJumpToTarget={(target) => sendCommand({ type: "display", target })}
                onRemoveAnnotation={(annotationId) => {
                  void annotations.removeById(annotationId);
                }}
              />
            </div>
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
