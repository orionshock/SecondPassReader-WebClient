import { useCallback, useEffect, useState } from "react";
import type { OpenedBook } from "./types";
import { EpubReaderPanel } from "./EpubReaderPanel";
import { inspectBlob, type EpubBlobDiagnostics } from "./epubDiagnostics";
import type { LocalHighlight } from "./types";

export function ReaderArea({
  openedBook,
  onClose,
}: {
  openedBook: OpenedBook | null;
  onClose: () => void;
}) {
  const [location, setLocation] = useState<string | null>(null);
  const [diag, setDiag] = useState<EpubBlobDiagnostics | null>(null);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<LocalHighlight[]>([]);
  const [highlightSelectedId, setHighlightSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setLocation(null);
  }, [openedBook?.objectUrl]);

  useEffect(() => {
    // Reset local-only highlights when switching books.
    setHighlights([]);
    setHighlightSelectedId(null);
  }, [openedBook?.openedAt]);

  const handleHighlightCreated = useCallback((h: LocalHighlight) => {
    setHighlights((prev) => {
      if (prev.some((x) => x.cfiRange === h.cfiRange)) return prev;
      return [h, ...prev];
    });
  }, []);

  const handleHighlightClicked = useCallback((id: string) => {
    setHighlightSelectedId(id);
  }, []);

  const handleRendererError = useCallback((msg: string) => {
    // eslint-disable-next-line no-console
    console.error("Renderer error:", msg);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setDiag(null);
    setDiagError(null);
    if (!openedBook) return;
    void (async () => {
      try {
        const d = await inspectBlob(openedBook.blob, 16);
        if (cancelled) return;
        setDiag(d);
      } catch (e) {
        if (cancelled) return;
        setDiagError(e instanceof Error ? e.message : "Failed to inspect blob.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openedBook?.blob]);

  if (!openedBook) {
    return <p className="muted">No book open. Select a book from the library.</p>;
  }

  const authors = (openedBook.book.authors ?? []).map((a) => a.name).filter(Boolean).join(", ");

  return (
    <div className="readerArea">
      <div className="readerHeader">
        <div>
          <div className="readerTitle">{openedBook.book.title}</div>
          {authors ? <div className="muted">{authors}</div> : null}
          {location ? (
            <div className="muted">
              location: <span className="mono">{location}</span>
            </div>
          ) : null}
          <div className="muted">local highlights: {highlights.length}</div>
        </div>
        <div>
          <button type="button" className="button" onClick={onClose}>
            Close reader
          </button>
        </div>
      </div>

      <div className="readerDiagBox">
        <div className="detailRow">
          <span className="muted">object URL:</span>{" "}
          <a href={openedBook.objectUrl} target="_blank" rel="noreferrer">
            Open object URL in new tab
          </a>
        </div>
        {diagError ? <div className="errorText">{diagError}</div> : null}
        {diag ? (
          <>
            <div className="detailRow">
              <span className="muted">blob size:</span> <span className="mono">{diag.blobSize}</span>
            </div>
            <div className="detailRow">
              <span className="muted">blob type:</span> <span className="mono">{diag.blobType || "—"}</span>
            </div>
            <div className="detailRow">
              <span className="muted">first bytes (ascii):</span> <span className="mono">{diag.firstBytesAscii}</span>
            </div>
            <div className="detailRow">
              <span className="muted">first bytes (hex):</span> <span className="mono">{diag.firstBytesHex}</span>
            </div>
            <div className="detailRow">
              <span className="muted">looks like ZIP:</span> {diag.looksLikeZip ? "yes" : "no"}
            </div>
            {!diag.looksLikeZip ? (
              <div className="warningText">
                The downloaded file does not look like an EPUB/ZIP. The server may have returned an HTML error page or
                another response.
              </div>
            ) : null}
          </>
        ) : (
          <div className="muted">Inspecting EPUB blob…</div>
        )}
      </div>

      <div className="panel">
        <h2 className="panelTitle">Local highlights (spike)</h2>
        {highlights.length === 0 ? (
          <p className="muted">Select text in the reader to create a highlight.</p>
        ) : (
          <ul className="highlightList">
            {highlights.map((h) => (
              <li key={h.id} className={`highlightRow ${h.id === highlightSelectedId ? "highlightRowSelected" : ""}`}>
                <div className="highlightMain">
                  <div className="highlightText">{h.text}</div>
                  <details className="highlightDetails">
                    <summary className="muted">details</summary>
                    <div className="mono">cfi: {h.cfiRange}</div>
                    <div className="mono">created: {h.createdAt}</div>
                  </details>
                </div>
                <div className="highlightActions">
                  <button
                    type="button"
                    className="button buttonDanger buttonCompact"
                    onClick={() => {
                      setHighlights((prev) => prev.filter((x) => x.id !== h.id));
                      if (highlightSelectedId === h.id) setHighlightSelectedId(null);
                    }}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <EpubReaderPanel
        blob={openedBook.blob}
        highlights={highlights}
        onLocationChanged={setLocation}
        onHighlightCreated={handleHighlightCreated}
        onHighlightClicked={handleHighlightClicked}
        onRendererError={handleRendererError}
      />
    </div>
  );
}
