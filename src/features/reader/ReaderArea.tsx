import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, SecondPassApiClient } from "../../api/SecondPassApiClient";
import type { ReadingOpenResponse, ReadingProgressUpdatePayload } from "../../schemas/readingSession";
import { AnnotationPanel } from "./AnnotationPanel";
import { EpubReaderPanel } from "./EpubReaderPanel";
import { ProgressPanel, type ProgressSaveState } from "./ProgressPanel";
import { ReaderDiagnostics } from "./ReaderDiagnostics";
import {
  createLocalHighlightFromServerAnnotation,
  createServerAnnotationPayloadFromLocalHighlight,
} from "./readingAnnotationAdapter";
import type { LocalHighlight, PendingSelection, ReaderLocation, OpenedBook } from "./types";

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
  const [locationString, setLocationString] = useState<string | null>(null);
  const [readerLocation, setReaderLocation] = useState<ReaderLocation | null>(null);

  const [highlights, setHighlights] = useState<LocalHighlight[]>([]);
  const [selectedHighlightId, setSelectedHighlightId] = useState<string | null>(null);

  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  const [saveState, setSaveState] = useState<ProgressSaveState>({ phase: "idle" });

  const prevSessionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setLocationString(null);
    setReaderLocation(null);
    setSaveState({ phase: "idle" });
  }, [openedBook?.objectUrl]);

  const readingOpen: ReadingOpenResponse | null = openedBook?.readingOpen ?? null;
  const sessionId = readingOpen?.session?.id ?? null;
  const effectiveProfileVersion = readingOpen?.profile_version ?? "0.1.0";

  useEffect(() => {
    if (!openedBook) return;
    const sid = openedBook.readingOpen?.session?.id ?? null;
    const bookId = openedBook.book?.id ?? null;
    const sessionKey = sid ? `${String(bookId)}:${sid}` : null;

    if (sessionKey && prevSessionKeyRef.current === sessionKey) return;
    prevSessionKeyRef.current = sessionKey;

    setHighlights([]);
    setSelectedHighlightId(null);
    setPendingSelection(null);
    setNoteOpen(false);
    setNoteDraft("");
  }, [openedBook?.readingOpen?.session?.id, openedBook?.book?.id]);

  useEffect(() => {
    const results = readingOpen?.annotations?.results;
    if (!Array.isArray(results) || results.length === 0) return;

    const converted = results
      .map((a) => createLocalHighlightFromServerAnnotation(a))
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    if (converted.length === 0) return;

    setHighlights((prev) => {
      const existingServerIds = new Set(prev.map((h) => h.serverAnnotationId).filter(Boolean) as string[]);
      const merged = [...prev];
      for (const h of converted) {
        if (h.serverAnnotationId && existingServerIds.has(h.serverAnnotationId)) continue;
        merged.push(h);
      }
      return merged;
    });
  }, [readingOpen?.session?.id, readingOpen?.annotations?.results]);

  const authors = useMemo(
    () => (openedBook?.book.authors ?? []).map((a) => a.name).filter(Boolean).join(", "),
    [openedBook?.book.authors],
  );

  const initialCfi =
    readingOpen?.progress?.current_location?.cfi ?? readingOpen?.progress?.current_location?.selector?.value ?? null;

  const currentCfi = readerLocation?.cfi ?? locationString;
  const currentHref = readerLocation?.href;
  const currentProgression = readerLocation?.progression ?? null;

  const progressPayload: ReadingProgressUpdatePayload | null = useMemo(() => {
    if (!currentCfi) return null;
    const payload: ReadingProgressUpdatePayload = {
      profile_version: effectiveProfileVersion,
      current_location: {
        format: "epub",
        cfi: currentCfi,
      },
    };
    if (currentHref) payload.current_location = { ...(payload.current_location ?? { format: "epub" }), href: currentHref };
    if (currentProgression != null) payload.progression = currentProgression;
    return payload;
  }, [currentCfi, currentHref, currentProgression, effectiveProfileVersion]);

  const canSaveProgress = Boolean(apiBaseUrl && accessToken && sessionId && progressPayload && saveState.phase !== "saving");

  const handleSaveProgress = useCallback(async () => {
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
          message: "Could not save progress. Your device token may be revoked or not allowed to access reading data.",
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
  }, [apiBaseUrl, accessToken, sessionId, progressPayload, tokenType]);

  const handleSaveHighlightToSession = useCallback(
    async (highlightId: string) => {
      if (!apiBaseUrl || !accessToken) return;
      if (!sessionId) return;

      const target = highlights.find((h) => h.id === highlightId);
      if (!target) return;
      if (target.serverSaveStatus === "saving" || target.serverSaveStatus === "saved" || target.serverAnnotationId) return;

      setHighlights((prev) =>
        prev.map((h) => (h.id === highlightId ? { ...h, serverSaveStatus: "saving", serverSaveError: undefined } : h)),
      );

      try {
        const payload = createServerAnnotationPayloadFromLocalHighlight({
          localHighlight: target,
          sessionId,
          profileVersion: effectiveProfileVersion,
        });

        const api = new SecondPassApiClient({ serverBaseUrl: apiBaseUrl });
        const created = await api.createReadingAnnotation({
          apiBaseUrl,
          accessToken,
          tokenType: tokenType ?? "Bearer",
          payload,
        });

        const now = new Date().toISOString();
        setHighlights((prev) =>
          prev.map((h) =>
            h.id === highlightId
              ? {
                  ...h,
                  serverAnnotationId: created.id,
                  serverSavedAt: now,
                  serverSaveStatus: "saved",
                  serverSaveError: undefined,
                }
              : h,
          ),
        );
      } catch (e) {
        const message =
          e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")
            ? "Could not save annotation. Your device token may be revoked or not allowed to access reading data."
            : e instanceof ApiError && e.status === 404
              ? "Could not save annotation. The reading session was not found or is no longer accessible."
              : e instanceof Error
                ? e.message
                : "Failed to save annotation.";

        setHighlights((prev) =>
          prev.map((h) => (h.id === highlightId ? { ...h, serverSaveStatus: "error", serverSaveError: message } : h)),
        );
      }
    },
    [apiBaseUrl, accessToken, effectiveProfileVersion, highlights, sessionId, tokenType],
  );

  const createDraftHighlight = useCallback((input: { cfiRange: string; text: string; note?: string }) => {
    const now = new Date().toISOString();
    const h: LocalHighlight = {
      id: `lh_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`,
      cfiRange: input.cfiRange,
      text: input.text,
      note: input.note,
      color: "yellow",
      createdAt: now,
      serverSaveStatus: "unsaved",
    };
    return h;
  }, []);

  const selectionPreview = useMemo(() => {
    if (!pendingSelection) return "";
    const t = pendingSelection.text.trim();
    return t.length > 80 ? `${t.slice(0, 80)}...` : t;
  }, [pendingSelection]);

  if (!openedBook) return <p className="muted">No book open. Select a book from the library.</p>;

  const serverAnnotationCount = readingOpen?.annotations?.count ?? null;
  const rehydratedCount = Array.isArray(readingOpen?.annotations?.results) ? readingOpen!.annotations.results.length : 0;

  return (
    <div className="readerArea">
      <div className="readerHeader">
        <div>
          <div className="readerTitle">{openedBook.book.title}</div>
          {authors ? <div className="muted">{authors}</div> : null}
          {locationString ? (
            <div className="muted">
              location: <span className="mono">{locationString}</span>
            </div>
          ) : null}
          <div className="muted">annotations: {highlights.length}</div>
          {readingOpen ? (
            <div className="muted">
              session: <span className="mono">{readingOpen.session.id}</span>
              {serverAnnotationCount !== null ? <span> · server annotations: {serverAnnotationCount}</span> : null}
              {rehydratedCount ? <span> · rehydrated: {rehydratedCount}</span> : null}
            </div>
          ) : null}
        </div>
        <div>
          <button type="button" className="button" onClick={onClose}>
            Close reader
          </button>
        </div>
      </div>

      <ProgressPanel
        currentCfi={currentCfi}
        currentHref={currentHref}
        progression={currentProgression}
        displayed={
          readerLocation?.displayedPage != null && readerLocation?.displayedTotal != null
            ? { page: readerLocation.displayedPage, total: readerLocation.displayedTotal }
            : null
        }
        canSave={canSaveProgress}
        saveState={saveState}
        progressPayload={progressPayload}
        onSave={handleSaveProgress}
      />

      <ReaderDiagnostics openedBook={openedBook} readingOpen={readingOpen} initialCfi={initialCfi} />

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
                  const h = createDraftHighlight({ cfiRange: pendingSelection.cfiRange, text: pendingSelection.text });
                  setHighlights((prev) => [h, ...prev]);
                  setPendingSelection(null);
                }}
              >
                Highlight
              </button>
              <button type="button" className="button buttonCompact" onClick={() => setNoteOpen(true)}>
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
                placeholder="Note..."
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
                    const h = createDraftHighlight({
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

      <AnnotationPanel
        highlights={highlights}
        selectedId={selectedHighlightId}
        onSelect={setSelectedHighlightId}
        onRemoveLocal={(id) => {
          setHighlights((prev) => prev.filter((x) => x.id !== id));
          if (selectedHighlightId === id) setSelectedHighlightId(null);
        }}
        onSaveToSession={(id) => void handleSaveHighlightToSession(id)}
        readingOpen={readingOpen}
        book={openedBook.book}
        apiReady={Boolean(apiBaseUrl && accessToken)}
      />

      <EpubReaderPanel
        blob={openedBook.blob}
        highlights={highlights}
        initialLocation={initialCfi ?? undefined}
        onLocationChanged={setLocationString}
        onReaderLocationChange={setReaderLocation}
        onHighlightClicked={setSelectedHighlightId}
        onTextSelected={(sel) => {
          if (pendingSelection?.cfiRange === sel.cfiRange) return;
          setPendingSelection(sel);
          setNoteOpen(false);
          setNoteDraft("");
        }}
      />
    </div>
  );
}
