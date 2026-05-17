import { useCallback, useEffect, useMemo, useState } from "react";
import type { OpenedBook } from "./types";
import { EpubReaderPanel } from "./EpubReaderPanel";
import { ApiError, SecondPassApiClient } from "../../api/SecondPassApiClient";
import type { LocalHighlight, PendingSelection, ReaderLocation } from "./types";
import { createW3CAnnotationFromLocalHighlight } from "./w3cAnnotationAdapter";
import type { ReadingOpenResponse, ReadingProgress, ReadingProgressUpdatePayload } from "../../schemas/readingSession";

export function ReaderArea({
  openedBook,
  onClose,
  apiBaseUrl,
  accessToken,
  tokenType,
}: {
  openedBook: OpenedBook | null;
  onClose: () => void;
  apiBaseUrl?: string;
  accessToken?: string;
  tokenType?: string;
}) {
  const [location, setLocation] = useState<string | null>(null);
  const [readerLocation, setReaderLocation] = useState<ReaderLocation | null>(null);
  const [highlights, setHighlights] = useState<LocalHighlight[]>([]);
  const [highlightSelectedId, setHighlightSelectedId] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [saveState, setSaveState] = useState<
    | { phase: "idle" }
    | { phase: "saving" }
    | { phase: "success"; savedAt: string; progress: ReadingProgress }
    | { phase: "error"; message: string }
  >({ phase: "idle" });

  useEffect(() => {
    setLocation(null);
    setReaderLocation(null);
    setSaveState({ phase: "idle" });
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
    return t.length > 80 ? `${t.slice(0, 80)}...` : t;
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

  const currentLocationCfi = readerLocation?.cfi ?? location;
  const currentHref = readerLocation?.href;
  const currentProgression = readerLocation?.progression;
  const sessionId = readingOpen?.session?.id ?? null;
  const effectiveProfileVersion = readingOpen?.profile_version ?? "0.1.0";

  const progressPayload: ReadingProgressUpdatePayload | null = useMemo(() => {
    if (!currentLocationCfi) return null;
    const payload: ReadingProgressUpdatePayload = {
      profile_version: effectiveProfileVersion,
      current_location: {
        format: "epub",
        cfi: currentLocationCfi,
      },
    };
    if (currentHref) {
      payload.current_location = { ...(payload.current_location ?? { format: "epub" }), href: currentHref };
    }
    if (currentProgression != null) payload.progression = currentProgression;
    return payload;
  }, [currentLocationCfi, currentHref, currentProgression, effectiveProfileVersion]);

  const canSaveProgress = Boolean(
    apiBaseUrl && accessToken && sessionId && progressPayload && saveState.phase !== "saving",
  );

  async function handleSaveProgress() {
    if (!apiBaseUrl || !accessToken || !sessionId || !progressPayload) return;

    setSaveState({ phase: "saving" });
    try {
      const api = new SecondPassApiClient({ serverBaseUrl: apiBaseUrl });
      const progress = await api.updateReadingProgress({
        apiBaseUrl,
        accessToken,
        tokenType: tokenType ?? "Bearer",
        sessionId,
        payload: progressPayload,
        method: "PATCH",
      });
      setSaveState({ phase: "success", savedAt: new Date().toISOString(), progress });
    } catch (e) {
      if (e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")) {
        setSaveState({
          phase: "error",
          message:
            "Could not save progress. Your device token may be revoked or not allowed to access reading data.",
        });
      } else if (e instanceof ApiError && e.status === 404) {
        setSaveState({
          phase: "error",
          message: "Could not save progress. The reading session was not found or is no longer accessible.",
        });
      } else {
        setSaveState({ phase: "error", message: e instanceof Error ? e.message : "Failed to save progress." });
      }
    }
  }

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

      <section className="panel progressPanel">
        <h2 className="panelTitle">Progress</h2>
        <div className="detailRow">
          <span className="muted">Current CFI:</span>{" "}
          {currentLocationCfi ? (
            <span className="mono">{currentLocationCfi}</span>
          ) : (
            <span className="muted">No current location yet</span>
          )}
        </div>
        <div className="detailRow">
          <span className="muted">Href:</span>{" "}
          {currentHref ? <span className="mono">{currentHref}</span> : <span className="muted">not available</span>}
        </div>
        <div className="detailRow">
          <span className="muted">Progression:</span>{" "}
          {currentProgression != null ? (
            <span className="mono">{Math.round(currentProgression * 1000) / 10}%</span>
          ) : (
            <span className="muted">not available</span>
          )}
        </div>
        {readerLocation?.displayedPage != null && readerLocation?.displayedTotal != null ? (
          <div className="detailRow">
            <span className="muted">Displayed:</span>{" "}
            <span className="mono">
              {readerLocation.displayedPage}/{readerLocation.displayedTotal}
            </span>
          </div>
        ) : null}

        <div className="formActions" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="button buttonPrimary"
            onClick={() => void handleSaveProgress()}
            disabled={!canSaveProgress}
          >
            {saveState.phase === "saving" ? "Saving..." : "Save progress"}
          </button>
        </div>

        {saveState.phase === "success" ? (
          <div className="muted" style={{ marginTop: 8 }}>
            <span className="pill pillOk">Progress saved</span> <span className="mono">{saveState.savedAt}</span>
          </div>
        ) : null}
        {saveState.phase === "error" ? (
          <p className="errorText" style={{ marginTop: 8 }}>
            {saveState.message}
          </p>
        ) : null}

        <details style={{ marginTop: 10 }}>
          <summary className="muted">Progress payload preview</summary>
          <pre className="codeBlock">{JSON.stringify(progressPayload ?? { note: "No current location yet." }, null, 2)}</pre>
        </details>

        {saveState.phase === "success" ? (
          <details style={{ marginTop: 10 }}>
            <summary className="muted">Saved progress response</summary>
            <pre className="codeBlock">{JSON.stringify(saveState.progress, null, 2)}</pre>
          </details>
        ) : null}
      </section>

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
        onReaderLocationChange={setReaderLocation}
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
