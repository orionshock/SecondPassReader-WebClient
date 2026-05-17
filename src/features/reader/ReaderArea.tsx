import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, SecondPassApiClient } from "../../api/SecondPassApiClient";
import type { ReadingOpenResponse, ReadingProgressUpdatePayload } from "../../schemas/readingSession";
import { AnnotationPanel } from "./AnnotationPanel";
import { EpubReaderPanel } from "./EpubReaderPanel";
import { NearEndBanner } from "./NearEndBanner";
import { ProgressPanel, type ProgressAutosaveState, type ProgressSaveState } from "./ProgressPanel";
import {
  createLocalHighlightFromServerAnnotation,
  createServerAnnotationPayloadFromLocalHighlight,
  createServerAnnotationUpdatePayloadFromLocalHighlight,
} from "./readingAnnotationAdapter";
import type { LocalHighlight, PendingSelection, ReaderLocation, OpenedBook } from "./types";

export function ReaderArea({
  openedBook,
  onBackToLibrary,
  apiBaseUrl,
  accessToken,
  tokenType,
}: {
  openedBook: OpenedBook | null;
  onBackToLibrary: () => void;
  apiBaseUrl?: string;
  accessToken?: string;
  tokenType?: string;
}) {
  const PROGRESS_AUTOSAVE_DELAY_MS = 5000;
  const NEAR_END_PROGRESSION_THRESHOLD = 0.98;
  const DEBUG_PROGRESS = import.meta.env.DEV;

  const [locationString, setLocationString] = useState<string | null>(null);
  const [readerLocation, setReaderLocation] = useState<ReaderLocation | null>(null);

  const [highlights, setHighlights] = useState<LocalHighlight[]>([]);
  const [selectedHighlightId, setSelectedHighlightId] = useState<string | null>(null);
  const [serverAnnotationPaging, setServerAnnotationPaging] = useState<{
    count: number;
    next: string | null;
    previous: string | null;
  } | null>(null);
  const [loadingMoreAnnotations, setLoadingMoreAnnotations] = useState(false);
  const [loadMoreAnnotationsError, setLoadMoreAnnotationsError] = useState<string | null>(null);

  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  const [saveState, setSaveState] = useState<ProgressSaveState>({ phase: "idle" });
  const [autosave, setAutosave] = useState<ProgressAutosaveState>({
    enabled: true,
    status: "idle",
  });
  const autosaveTimerRef = useRef<number | null>(null);
  const autosaveGenerationRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const progressPayloadRef = useRef<ReadingProgressUpdatePayload | null>(null);
  const currentCfiRef = useRef<string | null>(null);
  const autosaveDebugLastKeyRef = useRef<string | null>(null);

  const prevSessionKeyRef = useRef<string | null>(null);
  const [nearEndDismissed, setNearEndDismissed] = useState(false);
  const [closeSessionFirst, setCloseSessionFirst] = useState(false);
  const [nearEndMessage, setNearEndMessage] = useState<string | null>(null);
  const [goToStartSignal, setGoToStartSignal] = useState(0);
  const [autosaveKickSessionId, setAutosaveKickSessionId] = useState<string | null>(null);

  useEffect(() => {
    setLocationString(null);
    setReaderLocation(null);
    setSaveState({ phase: "idle" });
    setAutosave((prev) => ({ ...prev, status: "idle", error: undefined }));
  }, [openedBook?.objectUrl]);

  const [readingOpenState, setReadingOpenState] = useState<ReadingOpenResponse | null>(openedBook?.readingOpen ?? null);

  useEffect(() => {
    setReadingOpenState(openedBook?.readingOpen ?? null);
  }, [openedBook?.objectUrl]);

  const readingOpen: ReadingOpenResponse | null = readingOpenState;
  const sessionId = readingOpen?.session?.id ?? null;
  const effectiveProfileVersion = readingOpen?.profile_version ?? "0.1.0";

  useEffect(() => {
    if (!DEBUG_PROGRESS) return;
    // eslint-disable-next-line no-console
    console.log("[progress] sessionId changed", {
      sessionId,
      bookId: openedBook?.book?.id,
    });
  }, [DEBUG_PROGRESS, openedBook?.book?.id, sessionId]);

  useEffect(() => {
    if (!openedBook) return;
    const sid = readingOpen?.session?.id ?? null;
    const bookId = openedBook.book?.id ?? null;
    const sessionKey = sid ? `${String(bookId)}:${sid}` : null;

    if (sessionKey && prevSessionKeyRef.current === sessionKey) return;
    prevSessionKeyRef.current = sessionKey;

    setHighlights([]);
    setSelectedHighlightId(null);
    setPendingSelection(null);
    setNoteOpen(false);
    setNoteDraft("");
    setNearEndDismissed(false);
    setCloseSessionFirst(false);
    setNearEndMessage(null);
    setGoToStartSignal(0);
  }, [readingOpen?.session?.id, openedBook?.book?.id]);

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

  useEffect(() => {
    if (!readingOpen?.annotations) {
      setServerAnnotationPaging(null);
      setLoadMoreAnnotationsError(null);
      setLoadingMoreAnnotations(false);
      return;
    }
    setServerAnnotationPaging({
      count: readingOpen.annotations.count ?? 0,
      next: readingOpen.annotations.next ?? null,
      previous: readingOpen.annotations.previous ?? null,
    });
    setLoadMoreAnnotationsError(null);
    setLoadingMoreAnnotations(false);
  }, [readingOpen?.session?.id, readingOpen?.annotations?.count, readingOpen?.annotations?.next, readingOpen?.annotations?.previous]);

  const parseNextPage = useCallback((nextUrl: string | null): number | null => {
    if (!nextUrl) return null;
    try {
      const u = new URL(nextUrl);
      const pageRaw = u.searchParams.get("page");
      if (!pageRaw) return null;
      const page = Number(pageRaw);
      return Number.isFinite(page) && page > 0 ? page : null;
    } catch {
      return null;
    }
  }, []);

  const handleLoadMoreSavedAnnotations = useCallback(async () => {
    if (!apiBaseUrl || !accessToken) return;
    if (!sessionId) return;
    if (!serverAnnotationPaging?.next) return;
    if (loadingMoreAnnotations) return;

    const nextPage = parseNextPage(serverAnnotationPaging.next) ?? null;
    if (!nextPage) {
      setLoadMoreAnnotationsError("Could not determine next annotations page.");
      return;
    }

    setLoadingMoreAnnotations(true);
    setLoadMoreAnnotationsError(null);
    try {
      const api = new SecondPassApiClient({ serverBaseUrl: apiBaseUrl });
      const page = await api.listReadingAnnotations({
        apiBaseUrl,
        accessToken,
        tokenType: tokenType ?? "Bearer",
        sessionId,
        page: nextPage,
      });

      const converted = (page.results ?? [])
        .map((a) => createLocalHighlightFromServerAnnotation(a))
        .filter((x): x is NonNullable<typeof x> => Boolean(x));

      setHighlights((prev) => {
        const existingServerIds = new Set(prev.map((h) => h.serverAnnotationId).filter(Boolean) as string[]);
        const merged = [...prev];
        for (const h of converted) {
          if (h.serverAnnotationId && existingServerIds.has(h.serverAnnotationId)) continue;
          merged.push(h);
        }
        return merged;
      });

      setServerAnnotationPaging({
        count: page.count ?? serverAnnotationPaging.count,
        next: page.next ?? null,
        previous: page.previous ?? null,
      });
    } catch (e) {
      const message =
        e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")
          ? "Could not load annotations. Your device token may be revoked or not allowed to access reading data."
          : e instanceof ApiError && e.status === 404
            ? "Could not load annotations. The endpoint was not found or is no longer accessible."
            : e instanceof Error
              ? e.message
              : "Failed to load annotations.";
      setLoadMoreAnnotationsError(message);
    } finally {
      setLoadingMoreAnnotations(false);
    }
  }, [
    accessToken,
    apiBaseUrl,
    loadingMoreAnnotations,
    parseNextPage,
    serverAnnotationPaging,
    sessionId,
    tokenType,
  ]);

  const authors = useMemo(
    () => (openedBook?.book.authors ?? []).map((a) => a.name).filter(Boolean).join(", "),
    [openedBook?.book.authors],
  );
  const seriesLine = useMemo(() => {
    const seriesName = openedBook?.book.series?.name;
    const idx = openedBook?.book.series_index;
    if (!seriesName) return null;
    if (idx === null || idx === undefined || idx === "") return seriesName;
    return `${seriesName} #${idx}`;
  }, [openedBook?.book.series?.name, openedBook?.book.series_index]);

  const initialCfi =
    readingOpen?.progress?.current_location?.cfi ?? readingOpen?.progress?.current_location?.selector?.value ?? null;

  const currentCfi = readerLocation?.cfi ?? locationString;
  const currentHref = readerLocation?.href;
  const currentProgression = readerLocation?.progression ?? null;
  const nearEndActive =
    currentProgression != null && Number.isFinite(currentProgression) && currentProgression >= NEAR_END_PROGRESSION_THRESHOLD;
  const nearEndProgressSaved =
    !autosave.enabled ||
    autosave.status === "error" ||
    (autosave.lastAutosavedCfi != null && currentCfi != null && autosave.lastAutosavedCfi === currentCfi);

  useEffect(() => {
    if (!nearEndActive) {
      setNearEndDismissed(false);
      setNearEndMessage(null);
      setCloseSessionFirst(false);
    }
  }, [nearEndActive]);

  useEffect(() => {
    // After start-over, allow the first location we observe in the *new* session to schedule autosave,
    // even if it matches the server-provided initial current_location.
    if (!autosaveKickSessionId) return;
    if (sessionId !== autosaveKickSessionId) return;
    if (!currentCfi) return;

    if (DEBUG_PROGRESS) {
      // eslint-disable-next-line no-console
      console.log("[progress] autosave kick: first location observed for new session", {
        sessionId,
        cfi: `${currentCfi.slice(0, 48)}...`,
      });
    }

    setAutosave((prev) => ({
      ...prev,
      lastAutosavedAt: undefined,
      lastAutosavedCfi: undefined,
      status: "idle",
      error: undefined,
    }));
    setAutosaveKickSessionId(null);
  }, [autosaveKickSessionId, currentCfi, sessionId]);

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

  useEffect(() => {
    sessionIdRef.current = sessionId;
    progressPayloadRef.current = progressPayload;
    currentCfiRef.current = currentCfi ?? null;
    if (DEBUG_PROGRESS) {
      // eslint-disable-next-line no-console
      console.log("[progress] refs updated", {
        sessionId,
        hasPayload: Boolean(progressPayload),
        cfi: currentCfi ? `${currentCfi.slice(0, 48)}...` : null,
      });
    }
  }, [sessionId, progressPayload, currentCfi]);

  // Manual save UI is no longer shown in normal reader mode; keep saveState for internal success/error visibility if needed later.

  const saveProgress = useCallback(
    async (mode: "manual" | "autosave") => {
      const sid = sessionIdRef.current;
      const payload = progressPayloadRef.current;
      const cfi = currentCfiRef.current;
      if (!apiBaseUrl || !accessToken || !sid || !payload) return;

      if (mode === "manual") setSaveState({ phase: "saving" });
      if (mode === "autosave") {
        // eslint-disable-next-line no-console
        console.log("[progress] autosave: saving", { sessionId: sid, cfi: cfi ? `${cfi.slice(0, 48)}...` : null });
        setAutosave((prev) => ({ ...prev, status: "saving", error: undefined }));
      }

      try {
        const api = new SecondPassApiClient({ serverBaseUrl: apiBaseUrl });
        const progress = await api.updateReadingProgress({
          apiBaseUrl,
          accessToken,
          tokenType: tokenType ?? "Bearer",
          sessionId: sid,
          payload,
          method: "PATCH",
        });

        const savedAt = new Date().toISOString();
        setSaveState({ phase: "success", savedAt, progress });
        setAutosave((prev) => ({
          ...prev,
          status: mode === "autosave" ? "saved" : prev.status === "saving" ? "saved" : prev.status,
          lastAutosavedAt: savedAt,
          lastAutosavedCfi: cfi ?? prev.lastAutosavedCfi,
          error: undefined,
        }));
        if (mode === "autosave") {
          // eslint-disable-next-line no-console
          console.log("[progress] autosave: saved", { sessionId: sid, savedAt });
        }
      } catch (e) {
        const message =
          e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")
            ? "Could not save progress. Your device token may be revoked or not allowed to access reading data."
            : e instanceof ApiError && e.status === 404
              ? "Could not save progress. The reading session was not found or is no longer accessible."
              : e instanceof Error
                ? e.message
                : "Failed to save progress.";

        if (mode === "manual") setSaveState({ phase: "error", message });
        if (mode === "autosave") {
          // eslint-disable-next-line no-console
          console.warn("[progress] autosave: error", { sessionId: sid, message });
          setAutosave((prev) => ({ ...prev, status: "error", error: message }));
        }
      }
    },
    [accessToken, apiBaseUrl, tokenType],
  );

  useEffect(() => {
    // Initialize autosave baseline for this opened session so we don't immediately re-save the same CFI.
    if (!openedBook) return;
    if (DEBUG_PROGRESS) {
      // eslint-disable-next-line no-console
      console.log("[progress] autosave baseline init", {
        sessionId: readingOpen?.session?.id ?? null,
        initialCfi: initialCfi ? `${initialCfi.slice(0, 48)}...` : null,
      });
    }
    setAutosave((prev) => ({
      ...prev,
      lastAutosavedAt: undefined,
      lastAutosavedCfi: initialCfi ?? undefined,
      status: "idle",
      error: undefined,
    }));
  }, [openedBook?.objectUrl, readingOpen?.session?.id, initialCfi]);

  useEffect(() => {
    if (!readingOpen?.session?.id) return;
    // Clear any pending autosave timers when sessions change (including start-over).
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
    autosaveGenerationRef.current += 1;
    if (DEBUG_PROGRESS) {
      // eslint-disable-next-line no-console
      console.log("[progress] autosave generation bumped", {
        sessionId: readingOpen.session.id,
        gen: autosaveGenerationRef.current,
      });
    }
  }, [readingOpen?.session?.id]);

  useEffect(() => {
    if (!readingOpen?.session?.id) return;
    if (!autosave.enabled) return;
    // After a session swap (start-over), force one autosave scheduling pass once we have a fresh CFI.
    if (!currentCfi) return;
    if (autosave.lastAutosavedCfi) return;
    setAutosave((prev) => ({ ...prev, status: "waiting", error: undefined }));
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    const gen = autosaveGenerationRef.current;
    autosaveTimerRef.current = window.setTimeout(() => {
      if (gen !== autosaveGenerationRef.current) return;
      void saveProgress("autosave");
    }, PROGRESS_AUTOSAVE_DELAY_MS);
  }, [
    PROGRESS_AUTOSAVE_DELAY_MS,
    autosave.enabled,
    autosave.lastAutosavedCfi,
    currentCfi,
    readingOpen?.session?.id,
    saveProgress,
  ]);

  useEffect(() => {
    if (saveState.phase !== "saving") return;
    if (!autosaveTimerRef.current) return;
    window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
  }, [saveState.phase]);

  useEffect(() => {
    if (!autosave.enabled) {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
      return;
    }
    const reasons: string[] = [];
    if (!currentCfi) reasons.push("no-current-cfi");
    if (!apiBaseUrl) reasons.push("no-apiBaseUrl");
    if (!accessToken) reasons.push("no-accessToken");
    if (!sessionId) reasons.push("no-sessionId");
    if (!progressPayload) reasons.push("no-progressPayload");
    if (reasons.length > 0) {
      if (DEBUG_PROGRESS) {
        const key = `${sessionId ?? "null"}|${reasons.join(",")}`;
        if (autosaveDebugLastKeyRef.current !== key) {
          autosaveDebugLastKeyRef.current = key;
          // eslint-disable-next-line no-console
          console.log("[progress] autosave not scheduling", {
            sessionId,
            reasons,
            cfi: currentCfi ? `${currentCfi.slice(0, 48)}...` : null,
          });
        }
      }
      return;
    }

    // TypeScript narrowing: if we got here, we have a current CFI and payload.
    const cfi = currentCfi;
    if (!cfi) return;
    if (saveState.phase === "saving" || autosave.status === "saving") {
      setAutosave((prev) => ({ ...prev, status: "dirty" }));
      return;
    }

    if (autosave.lastAutosavedCfi && autosave.lastAutosavedCfi === cfi) {
      if (DEBUG_PROGRESS) {
        const key = `${sessionId}|same-cfi`;
        if (autosaveDebugLastKeyRef.current !== key) {
          autosaveDebugLastKeyRef.current = key;
          // eslint-disable-next-line no-console
          console.log("[progress] autosave suppressed (same cfi)", {
            sessionId,
            cfi: `${cfi.slice(0, 48)}...`,
          });
        }
      }
      return;
    }

    setAutosave((prev) => ({ ...prev, status: "waiting", error: undefined }));

    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    const gen = autosaveGenerationRef.current;
    if (DEBUG_PROGRESS) {
      // eslint-disable-next-line no-console
      console.log("[progress] autosave scheduled", {
        sessionId,
        gen,
        cfi: `${cfi.slice(0, 48)}...`,
        delayMs: PROGRESS_AUTOSAVE_DELAY_MS,
      });
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      if (gen !== autosaveGenerationRef.current) return;
      if (DEBUG_PROGRESS) {
        // eslint-disable-next-line no-console
        console.log("[progress] autosave timer fired", { sessionId: sessionIdRef.current, gen });
      }
      void saveProgress("autosave");
    }, PROGRESS_AUTOSAVE_DELAY_MS);

    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    };
  }, [
    PROGRESS_AUTOSAVE_DELAY_MS,
    accessToken,
    apiBaseUrl,
    autosave.enabled,
    autosave.lastAutosavedCfi,
    autosave.status,
    currentCfi,
    progressPayload,
    saveProgress,
    saveState.phase,
    sessionId,
  ]);

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

  const handleDeleteHighlightFromSession = useCallback(
    async (highlightId: string) => {
      if (!apiBaseUrl || !accessToken) return;
      const target = highlights.find((h) => h.id === highlightId);
      if (!target?.serverAnnotationId) return;
      if (target.serverDeleteStatus === "deleting") return;

      setHighlights((prev) =>
        prev.map((h) =>
          h.id === highlightId ? { ...h, serverDeleteStatus: "deleting", serverDeleteError: undefined } : h,
        ),
      );

      try {
        const api = new SecondPassApiClient({ serverBaseUrl: apiBaseUrl });
        await api.deleteReadingAnnotation({
          apiBaseUrl,
          accessToken,
          tokenType: tokenType ?? "Bearer",
          annotationId: target.serverAnnotationId,
        });

        setHighlights((prev) => prev.filter((h) => h.id !== highlightId));
        if (selectedHighlightId === highlightId) setSelectedHighlightId(null);
      } catch (e) {
        const message =
          e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")
            ? "Could not delete annotation. Your device token may be revoked or not allowed to access reading data."
            : e instanceof ApiError && e.status === 404
              ? "Could not delete annotation. It may already be deleted or no longer accessible."
              : e instanceof Error
                ? e.message
                : "Failed to delete annotation.";

        setHighlights((prev) =>
          prev.map((h) => (h.id === highlightId ? { ...h, serverDeleteStatus: "error", serverDeleteError: message } : h)),
        );
      }
    },
    [apiBaseUrl, accessToken, highlights, selectedHighlightId, tokenType],
  );

  const handleUpdateSavedAnnotationNote = useCallback(
    async (highlightId: string, newNoteText: string) => {
      if (!apiBaseUrl || !accessToken) return;
      if (!sessionId) return;

      const target = highlights.find((h) => h.id === highlightId);
      if (!target?.serverAnnotationId) return;
      if (target.serverUpdateStatus === "saving") return;

      setHighlights((prev) =>
        prev.map((h) =>
          h.id === highlightId ? { ...h, serverUpdateStatus: "saving", serverUpdateError: undefined } : h,
        ),
      );

      const trimmed = newNoteText.trim();
      const nextHighlight: LocalHighlight = { ...target, note: trimmed ? trimmed : undefined };

      try {
        const payload = createServerAnnotationUpdatePayloadFromLocalHighlight({
          localHighlight: nextHighlight,
          sessionId,
          profileVersion: effectiveProfileVersion,
        });

        const api = new SecondPassApiClient({ serverBaseUrl: apiBaseUrl });
        const updated = await api.updateReadingAnnotation({
          apiBaseUrl,
          accessToken,
          tokenType: tokenType ?? "Bearer",
          annotationId: target.serverAnnotationId,
          payload,
        });

        const updatedAt =
          (typeof (updated as any)?.updated_at === "string" && (updated as any).updated_at) ||
          (typeof (updated as any)?.modified === "string" && (updated as any).modified) ||
          new Date().toISOString();

        setHighlights((prev) =>
          prev.map((h) =>
            h.id === highlightId
              ? {
                  ...h,
                  note: nextHighlight.note,
                  serverUpdateStatus: undefined,
                  serverUpdateError: undefined,
                  serverUpdatedAt: updatedAt,
                }
              : h,
          ),
        );
      } catch (e) {
        const message =
          e instanceof ApiError && e.status === 400
            ? e.message
            : e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")
              ? "Could not update annotation. Your device token may be revoked or not allowed to modify reading data."
              : e instanceof ApiError && e.status === 404
                ? "Could not update annotation. It may have been deleted or is no longer accessible."
                : e instanceof Error
                  ? e.message
                  : "Failed to update annotation.";

        setHighlights((prev) =>
          prev.map((h) => (h.id === highlightId ? { ...h, serverUpdateStatus: "error", serverUpdateError: message } : h)),
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

  const loadedServerAnnotations = highlights.filter((h) => Boolean(h.serverAnnotationId)).length;

  return (
    <div className="readerArea">
      <div className="readerTopBar">
        <div className="readerTopLeft">
          <div className="readerBookTitle">{openedBook.book.title}</div>
          <div className="readerBookSubtitle muted">
            {seriesLine ? <span>{seriesLine}</span> : null}
            {seriesLine && authors ? <span className="sep"> · </span> : null}
            {authors ? <span>{authors}</span> : null}
          </div>
        </div>
        <div className="readerTopRight">
          <button type="button" className="button buttonCompact" onClick={onBackToLibrary}>
            Back to Library
          </button>
        </div>
      </div>

      <ProgressPanel
        autosave={autosave}
        currentHref={currentHref}
        progression={currentProgression}
      />

       {nearEndActive && !nearEndDismissed && nearEndProgressSaved ? (
         <NearEndBanner
           closeSessionFirst={closeSessionFirst}
           disabled={closeSessionFirst}
           message={nearEndMessage}
          onToggleCloseSessionFirst={(checked) => {
            setCloseSessionFirst(checked);
            setNearEndMessage(null);
          }}
          onGoToStart={async () => {
            setNearEndMessage(null);
            if (!openedBook) return;

            if (!closeSessionFirst) {
              setGoToStartSignal((v) => v + 1);
              setNearEndMessage("Returned to start.");
              setNearEndDismissed(true);
              return;
            }

            if (!apiBaseUrl || !accessToken) {
              setNearEndMessage("Finish session + start over is not available.");
              return;
            }

             try {
               const api = new SecondPassApiClient({ serverBaseUrl: apiBaseUrl });
               if (DEBUG_PROGRESS) {
                 // eslint-disable-next-line no-console
                 console.log("[progress] start-over: request", { bookId: openedBook.book.id, priorSessionId: sessionIdRef.current });
               }
              let next = await api.startOverReadingSession({
                apiBaseUrl,
                accessToken,
                tokenType: tokenType ?? "Bearer",
                bookId: openedBook.book.id,
              });

              const nextSessionId: string | null = (next as unknown as { session?: { id?: string } })?.session?.id ?? null;
              if (!nextSessionId) {
                // Some server variants may return a minimal payload; fall back to an explicit open to get a full session object.
                if (DEBUG_PROGRESS) {
                  // eslint-disable-next-line no-console
                  console.warn("[progress] start-over: response missing session.id; falling back to openReadingSession", {
                    keys: next && typeof next === "object" ? Object.keys(next as object) : typeof next,
                  });
                }
                next = await api.openReadingSession({
                  apiBaseUrl,
                  accessToken,
                  tokenType: tokenType ?? "Bearer",
                  bookId: openedBook.book.id,
                });
              }
              if (DEBUG_PROGRESS) {
                // eslint-disable-next-line no-console
                console.log("[progress] start-over: response", {
                  newSessionId: (next as unknown as { session?: { id?: string } })?.session?.id ?? null,
                  profileVersion: (next as unknown as { profile_version?: unknown })?.profile_version ?? null,
                });
              }

              setReadingOpenState(next);
              setAutosave((prev) => ({
                ...prev,
                status: "idle",
                lastAutosavedAt: undefined,
                lastAutosavedCfi: undefined,
                error: undefined,
              }));
              setLocationString(null);
              setReaderLocation(null);
              setHighlights([]);
              setSelectedHighlightId(null);
              setPendingSelection(null);
              setNoteOpen(false);
              setNoteDraft("");
              setNearEndDismissed(true);
              setCloseSessionFirst(false);
              setNearEndMessage("Started a new session at the beginning.");
              setGoToStartSignal((v) => v + 1);
              {
                const sid = (next as unknown as { session?: { id?: string } })?.session?.id ?? null;
                if (sid) setAutosaveKickSessionId(sid);
              }
            } catch (e) {
              const message =
                e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")
                  ? "Could not start over. Your device token may be revoked or not allowed to access reading data."
                  : e instanceof ApiError && e.status === 404
                    ? "Could not start over. You may not have access to this book."
                    : e instanceof Error
                      ? e.message
                      : "Failed to start over.";
              setNearEndMessage(message);
            }
          }}
          onNextBook={() => {
            setNearEndMessage(closeSessionFirst ? "Finish session + next book is not wired yet." : "Next book is not wired yet.");
          }}
          onResume={() => {
            setNearEndDismissed(true);
            setNearEndMessage(null);
          }}
        />
      ) : null}

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

      <EpubReaderPanel
        blob={openedBook.blob}
        highlights={highlights}
        initialLocation={initialCfi ?? undefined}
        goToStartSignal={goToStartSignal}
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

      <AnnotationPanel
        highlights={highlights}
        selectedId={selectedHighlightId}
        onSelect={setSelectedHighlightId}
        onRemoveLocal={(id) => {
          setHighlights((prev) => prev.filter((x) => x.id !== id));
          if (selectedHighlightId === id) setSelectedHighlightId(null);
        }}
        onSaveToSession={(id) => void handleSaveHighlightToSession(id)}
        onDeleteFromSession={(id) => void handleDeleteHighlightFromSession(id)}
        onUpdateNote={(id, note) => void handleUpdateSavedAnnotationNote(id, note)}
        serverPageInfo={
          serverAnnotationPaging
            ? {
                count: serverAnnotationPaging.count ?? 0,
                loaded: loadedServerAnnotations,
                next: serverAnnotationPaging.next,
                loading: loadingMoreAnnotations,
                error: loadMoreAnnotationsError,
              }
            : null
        }
        onLoadMoreSavedAnnotations={() => void handleLoadMoreSavedAnnotations()}
        readingOpen={readingOpen}
        book={openedBook.book}
        apiReady={Boolean(apiBaseUrl && accessToken)}
      />
    </div>
  );
}
