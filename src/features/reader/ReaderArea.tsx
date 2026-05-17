import { useCallback, useEffect, useMemo, useState } from "react";
import type { OpenedBook } from "./types";
import { EpubReaderPanel } from "./EpubReaderPanel";
import type { LocalHighlight, PendingSelection } from "./types";
import { createW3CAnnotationFromLocalHighlight } from "./w3cAnnotationAdapter";
import type { ReadingOpenResponse } from "../../schemas/readingSession";

export function ReaderArea({
  openedBook,
  onClose,
}: {
  openedBook: OpenedBook | null;
  onClose: () => void;
}) {
  const [location, setLocation] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<LocalHighlight[]>([]);
  const [highlightSelectedId, setHighlightSelectedId] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  useEffect(() => {
    setLocation(null);
  }, [openedBook?.objectUrl]);

  useEffect(() => {
    // Reset local-only highlights when switching books.
    setHighlights([]);
    setHighlightSelectedId(null);
    setPendingSelection(null);
    setNoteOpen(false);
    setNoteDraft("");
  }, [openedBook?.openedAt]);

  function createLocalHighlight(input: { cfiRange: string; text: string; note?: string }) {
    return {
      id: `lh_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`,
      cfiRange: input.cfiRange,
      text: input.text,
      note: input.note,
      color: "yellow",
      createdAt: new Date().toISOString(),
    } satisfies LocalHighlight;
  }

  const selectionPreview = useMemo(() => {
    if (!pendingSelection) return "";
    const t = pendingSelection.text.trim();
    return t.length > 80 ? `${t.slice(0, 80)}…` : t;
  }, [pendingSelection]);

  const handleHighlightClicked = useCallback((id: string) => {
    setHighlightSelectedId(id);
  }, []);

  const handleRendererError = useCallback((msg: string) => {
    // eslint-disable-next-line no-console
    console.error("Renderer error:", msg);
  }, []);

  if (!openedBook) {
    return <p className="muted">No book open. Select a book from the library.</p>;
  }

  const authors = (openedBook.book.authors ?? []).map((a) => a.name).filter(Boolean).join(", ");
  const w3cPreviewCount = highlights.length;

  const readingOpen: ReadingOpenResponse | null = openedBook.readingOpen ?? null;
  const serverAnnotationCount = readingOpen?.annotations?.count ?? null;
  const initialCfi =
    readingOpen?.progress?.current_location?.cfi ?? readingOpen?.progress?.current_location?.selector?.value ?? null;

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
          <div className="muted">
            local highlights: {highlights.length} · W3C previews: {w3cPreviewCount}
          </div>
          {readingOpen ? (
            <div className="muted">
              session: <span className="mono">{readingOpen.session.id}</span>
              {serverAnnotationCount !== null ? <span> · server annotations: {serverAnnotationCount}</span> : null}
            </div>
          ) : null}
        </div>
        <div>
          <button type="button" className="button" onClick={onClose}>
            Close reader
          </button>
        </div>
      </div>

      <details className="readerDiagBox">
        <summary className="muted">Diagnostics</summary>
        <div className="readerDiagBody">
          {readingOpen ? (
            <details className="readerDiagSubdetails">
              <summary className="muted">Reading session payload</summary>
              <div className="readerDiagBody">
                <div className="detailRow">
                  <span className="muted">profile_version:</span> <span className="mono">{readingOpen.profile_version}</span>
                </div>
                <div className="detailRow">
                  <span className="muted">session id:</span> <span className="mono">{readingOpen.session.id}</span>
                </div>
                {"status" in readingOpen.session && readingOpen.session.status ? (
                  <div className="detailRow">
                    <span className="muted">session status:</span>{" "}
                    <span className="mono">{String(readingOpen.session.status)}</span>
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
            <summary className="muted">EPUB file (simplified)</summary>
            <div className="readerDiagBody">
              <div className="detailRow">
                <span className="muted">blob size:</span> <span className="mono">{openedBook.blob.size}</span>
              </div>
              <div className="detailRow">
                <span className="muted">blob type:</span> <span className="mono">{openedBook.blob.type || "—"}</span>
              </div>
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

      {pendingSelection ? (
        <div className="annotationFloat">
          <div className="annotationFloatTitle">Selection</div>
          <div className="annotationFloatText mono">{selectionPreview || "(no text captured)"}</div>

          {!noteOpen ? (
            <div className="annotationFloatActions">
              <button
                type="button"
                className="button buttonPrimary buttonCompact"
                onClick={() => {
                  if (highlights.some((h) => h.cfiRange === pendingSelection.cfiRange)) {
                    setPendingSelection(null);
                    return;
                  }
                  const h = createLocalHighlight({ cfiRange: pendingSelection.cfiRange, text: pendingSelection.text });
                  setHighlights((prev) => [h, ...prev]);
                  setPendingSelection(null);
                }}
              >
                Highlight
              </button>
              <button
                type="button"
                className="button buttonCompact"
                onClick={() => {
                  setNoteOpen(true);
                }}
              >
                Add note
              </button>
              <button
                type="button"
                className="button buttonCompact"
                onClick={() => {
                  setPendingSelection(null);
                  setNoteOpen(false);
                  setNoteDraft("");
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="annotationFloatNote">
              <textarea
                className="input"
                rows={3}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Note…"
              />
              <div className="annotationFloatActions">
                <button
                  type="button"
                  className="button buttonPrimary buttonCompact"
                  onClick={() => {
                    if (highlights.some((h) => h.cfiRange === pendingSelection.cfiRange)) {
                      setPendingSelection(null);
                      setNoteOpen(false);
                      setNoteDraft("");
                      return;
                    }
                    const note = noteDraft.trim();
                    const h = createLocalHighlight({
                      cfiRange: pendingSelection.cfiRange,
                      text: pendingSelection.text,
                      note: note || undefined,
                    });
                    setHighlights((prev) => [h, ...prev]);
                    setPendingSelection(null);
                    setNoteOpen(false);
                    setNoteDraft("");
                  }}
                >
                  Save note
                </button>
                <button
                  type="button"
                  className="button buttonCompact"
                  onClick={() => {
                    setPendingSelection(null);
                    setNoteOpen(false);
                    setNoteDraft("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

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
                  {h.note ? <div className="muted">note: {h.note}</div> : null}
                  <details className="highlightDetails">
                    <summary className="muted">details</summary>
                    <div className="mono">cfi: {h.cfiRange}</div>
                    <div className="mono">created: {h.createdAt}</div>
                  </details>
                  <details className="highlightDetails">
                    <summary className="muted">W3C annotation preview</summary>
                    <pre className="codeBlock">
                      {JSON.stringify(
                        createW3CAnnotationFromLocalHighlight({ localHighlight: h, book: openedBook.book }),
                        null,
                        2,
                      )}
                    </pre>
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
        initialLocation={initialCfi ?? undefined}
        onLocationChanged={setLocation}
        onHighlightClicked={handleHighlightClicked}
        onTextSelected={(sel) => {
          if (pendingSelection?.cfiRange === sel.cfiRange) return;
          setPendingSelection(sel);
          setNoteOpen(false);
          setNoteDraft("");
        }}
        onRendererError={handleRendererError}
      />
    </div>
  );
}
