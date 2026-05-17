import { useEffect, useState } from "react";
import type { OpenedBook } from "./types";
import { EpubReaderPanel } from "./EpubReaderPanel";
import { inspectBlob, type EpubBlobDiagnostics } from "./epubDiagnostics";

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

  useEffect(() => {
    setLocation(null);
  }, [openedBook?.objectUrl]);

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

      <EpubReaderPanel blob={openedBook.blob} onLocationChanged={setLocation} />
    </div>
  );
}
