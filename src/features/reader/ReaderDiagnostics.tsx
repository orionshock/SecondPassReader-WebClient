import type { ReadingOpenResponse } from "../../schemas/readingSession";
import type { OpenedBook } from "./types";

export function ReaderDiagnostics({
  openedBook,
  readingOpen,
  initialCfi,
}: {
  openedBook: OpenedBook;
  readingOpen: ReadingOpenResponse | null;
  initialCfi: string | null;
}) {
  return (
    <details className="readerDiagBox">
      <summary className="muted">Diagnostics</summary>
      <div className="readerDiagBody">
        {readingOpen ? (
          <details className="readerDiagSubdetails">
            <summary className="muted">Reading session payload</summary>
            <div className="readerDiagBody">
              <div className="detailRow">
                <span className="muted">profile_version:</span>{" "}
                <span className="mono">{readingOpen.profile_version}</span>
              </div>
              <div className="detailRow">
                <span className="muted">session id:</span> <span className="mono">{readingOpen.session.id}</span>
              </div>
              {"status" in readingOpen.session && (readingOpen.session as any).status ? (
                <div className="detailRow">
                  <span className="muted">session status:</span>{" "}
                  <span className="mono">{String((readingOpen.session as any).status)}</span>
                </div>
              ) : null}
              {readingOpen.progress?.progression != null ? (
                <div className="detailRow">
                  <span className="muted">progression:</span>{" "}
                  <span className="mono">{String(readingOpen.progress.progression)}</span>
                </div>
              ) : null}
              {initialCfi ? (
                <div className="detailRow">
                  <span className="muted">current_location cfi:</span> <span className="mono">{initialCfi}</span>
                </div>
              ) : null}
              {readingOpen.progress?.current_location ? (
                <details className="readerDiagSubdetails">
                  <summary className="muted">current_location</summary>
                  <pre className="codeBlock">{JSON.stringify(readingOpen.progress.current_location, null, 2)}</pre>
                </details>
              ) : null}
              <div className="detailRow">
                <span className="muted">annotations page:</span>{" "}
                <span className="mono">
                  count={String(readingOpen.annotations?.count ?? "—")} results={String(readingOpen.annotations?.results?.length ?? 0)}
                </span>
              </div>
              {readingOpen.annotations?.next || readingOpen.annotations?.previous ? (
                <div className="detailRow">
                  <span className="muted">page links:</span>{" "}
                  <span className="mono">
                    next={readingOpen.annotations.next ?? "—"} prev={readingOpen.annotations.previous ?? "—"}
                  </span>
                </div>
              ) : null}
              {readingOpen.annotations?.results?.length ? (
                <details className="readerDiagSubdetails">
                  <summary className="muted">Returned annotations (first page)</summary>
                  <ul className="muted" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                    {readingOpen.annotations.results.slice(0, 25).map((a) => (
                      <li key={String(a.id)}>
                        <span className="mono">{String(a.id)}</span>
                        {a.motivation ? <span> · {String(a.motivation)}</span> : null}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <details className="readerDiagSubdetails">
                <summary className="muted">Raw open response (JSON)</summary>
                <pre className="codeBlock">{JSON.stringify(readingOpen, null, 2)}</pre>
              </details>
            </div>
          </details>
        ) : (
          <div className="muted">No reading session payload attached to this opened book.</div>
        )}

        <details className="readerDiagSubdetails">
          <summary className="muted">EPUB object URL</summary>
          <div className="readerDiagBody">
            <div className="detailRow">
              <span className="muted">object URL:</span>{" "}
              <a href={openedBook.objectUrl} target="_blank" rel="noreferrer">
                Open object URL in new tab
              </a>
            </div>
          </div>
        </details>
      </div>
    </details>
  );
}

