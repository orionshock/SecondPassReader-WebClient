import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, SecondPassApiClient } from "../../api/SecondPassApiClient";
import type { ReadingOpenResponse } from "../../schemas/readingSession";
import { createIdempotencyKey } from "./idempotency";
import {
  createLocalHighlightFromServerAnnotation,
  createServerAnnotationPayloadFromLocalHighlight,
  createServerAnnotationUpdatePayloadFromLocalHighlight,
} from "./readingAnnotationAdapter";
import type { LocalHighlight, PendingSelection } from "./types";
import { DEFAULT_HIGHLIGHT_COLOR, isHighlightColor, type HighlightColor } from "./highlightColors";

type ServerAnnotationPaging = {
  count: number;
  next: string | null;
  previous: string | null;
};

export function useReaderAnnotations(input: {
  openedBookKey: string | null;
  readingOpen: ReadingOpenResponse | null;
  apiBaseUrl?: string;
  accessToken?: string;
  tokenType?: string;
  sessionId: string | null;
  profileVersion: string;
}) {
  const { readingOpen, sessionId, profileVersion } = input;

  const [highlights, setHighlights] = useState<LocalHighlight[]>([]);
  const [selectedHighlightId, setSelectedHighlightId] = useState<string | null>(null);
  const [serverAnnotationPaging, setServerAnnotationPaging] = useState<ServerAnnotationPaging | null>(null);
  const [loadingMoreAnnotations, setLoadingMoreAnnotations] = useState(false);
  const [loadMoreAnnotationsError, setLoadMoreAnnotationsError] = useState<string | null>(null);

  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [pendingColor, setPendingColor] = useState<HighlightColor>(DEFAULT_HIGHLIGHT_COLOR);
  const [previewHighlightId, setPreviewHighlightId] = useState<string | null>(null);

  const prevSessionKeyRef = useRef<string | null>(null);
  const autosaveInFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const sid = readingOpen?.session?.id ?? null;
    const sessionKey = sid ? `${String(input.openedBookKey ?? "book")}:${sid}` : null;

    if (sessionKey && prevSessionKeyRef.current === sessionKey) return;
    prevSessionKeyRef.current = sessionKey;

    setHighlights([]);
    setSelectedHighlightId(null);
    setPendingSelection(null);
    setNoteOpen(false);
    setNoteDraft("");
    setPendingColor(DEFAULT_HIGHLIGHT_COLOR);
  }, [input.openedBookKey, readingOpen?.session?.id]);

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

  const loadMoreSavedAnnotations = useCallback(async () => {
    if (!input.apiBaseUrl || !input.accessToken) return;
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
      const api = new SecondPassApiClient({ serverBaseUrl: input.apiBaseUrl });
      const page = await api.listReadingAnnotations({
        apiBaseUrl: input.apiBaseUrl,
        accessToken: input.accessToken,
        tokenType: input.tokenType ?? "Bearer",
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
    input.accessToken,
    input.apiBaseUrl,
    input.tokenType,
    loadingMoreAnnotations,
    parseNextPage,
    serverAnnotationPaging,
    sessionId,
  ]);

  const saveHighlightToSession = useCallback(
    async (highlightId: string) => {
      if (!input.apiBaseUrl || !input.accessToken) return;
      if (!sessionId) return;

      const target = highlights.find((h) => h.id === highlightId);
      if (!target) return;
      if (target.serverSaveStatus === "saving" || target.serverSaveStatus === "saved" || target.serverAnnotationId) return;

      // Ensure a stable idempotency key for this draft so retries don't create duplicates.
      const idempotencyKey = target.createIdempotencyKey ?? createIdempotencyKey();
      if (!target.createIdempotencyKey) {
        setHighlights((prev) => prev.map((h) => (h.id === highlightId ? { ...h, createIdempotencyKey: idempotencyKey } : h)));
      }

      setHighlights((prev) =>
        prev.map((h) => (h.id === highlightId ? { ...h, serverSaveStatus: "saving", serverSaveError: undefined } : h)),
      );

      try {
        const payload = createServerAnnotationPayloadFromLocalHighlight({
          localHighlight: target,
          sessionId,
          profileVersion,
        });

        const api = new SecondPassApiClient({ serverBaseUrl: input.apiBaseUrl });
        const created = await api.createReadingAnnotation({
          apiBaseUrl: input.apiBaseUrl,
          accessToken: input.accessToken,
          tokenType: input.tokenType ?? "Bearer",
          payload,
          idempotencyKey,
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
          e instanceof ApiError && e.status === 409
            ? e.message
            : e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")
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
    [highlights, input.accessToken, input.apiBaseUrl, input.tokenType, profileVersion, sessionId],
  );

  // Autosave newly created draft annotations (created from selection toolbar).
  useEffect(() => {
    if (!input.apiBaseUrl || !input.accessToken) return;
    if (!sessionId) return;

    for (const h of highlights) {
      if (h.readOnly) continue;
      if (h.serverAnnotationId) continue;
      if (h.serverSaveStatus !== "unsaved") continue;
      if (autosaveInFlightRef.current.has(h.id)) continue;

      autosaveInFlightRef.current.add(h.id);
      void saveHighlightToSession(h.id).finally(() => {
        autosaveInFlightRef.current.delete(h.id);
      });
    }
  }, [highlights, input.accessToken, input.apiBaseUrl, saveHighlightToSession, sessionId]);

  const deleteHighlightFromSession = useCallback(
    async (highlightId: string) => {
      if (!input.apiBaseUrl || !input.accessToken) return;
      const target = highlights.find((h) => h.id === highlightId);
      if (!target?.serverAnnotationId) return;
      if (target.serverDeleteStatus === "deleting") return;

      setHighlights((prev) =>
        prev.map((h) => (h.id === highlightId ? { ...h, serverDeleteStatus: "deleting", serverDeleteError: undefined } : h)),
      );

      try {
        const api = new SecondPassApiClient({ serverBaseUrl: input.apiBaseUrl });
        await api.deleteReadingAnnotation({
          apiBaseUrl: input.apiBaseUrl,
          accessToken: input.accessToken,
          tokenType: input.tokenType ?? "Bearer",
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
    [highlights, input.accessToken, input.apiBaseUrl, input.tokenType, selectedHighlightId],
  );

  const updateSavedAnnotationNote = useCallback(
    async (highlightId: string, newNoteText: string, nextColor?: HighlightColor) => {
      if (!input.apiBaseUrl || !input.accessToken) return;
      if (!sessionId) return;

      const target = highlights.find((h) => h.id === highlightId);
      if (!target?.serverAnnotationId) return;
      if (target.serverUpdateStatus === "saving") return;

      setHighlights((prev) =>
        prev.map((h) => (h.id === highlightId ? { ...h, serverUpdateStatus: "saving", serverUpdateError: undefined } : h)),
      );

      const trimmed = newNoteText.trim();
      const safeColor =
        typeof nextColor === "string" && isHighlightColor(nextColor)
          ? nextColor
          : isHighlightColor(target.color)
            ? target.color
            : DEFAULT_HIGHLIGHT_COLOR;
      const nextHighlight: LocalHighlight = { ...target, note: trimmed ? trimmed : undefined, color: safeColor };

      try {
        const payload = createServerAnnotationUpdatePayloadFromLocalHighlight({
          localHighlight: nextHighlight,
          sessionId,
          profileVersion,
        });

        const api = new SecondPassApiClient({ serverBaseUrl: input.apiBaseUrl });
        const updated = await api.updateReadingAnnotation({
          apiBaseUrl: input.apiBaseUrl,
          accessToken: input.accessToken,
          tokenType: input.tokenType ?? "Bearer",
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
                  color: nextHighlight.color,
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
    [highlights, input.accessToken, input.apiBaseUrl, input.tokenType, profileVersion, sessionId],
  );

  const createDraftHighlight = useCallback((draft: { cfiRange: string; text: string; note?: string; color?: HighlightColor }) => {
    const now = new Date().toISOString();
    const h: LocalHighlight = {
      id: `lh_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`,
      cfiRange: draft.cfiRange,
      text: draft.text,
      note: draft.note,
      color: draft.color ?? DEFAULT_HIGHLIGHT_COLOR,
      createdAt: now,
      createIdempotencyKey: createIdempotencyKey(),
      serverSaveStatus: "unsaved",
    };
    return h;
  }, []);

  const onTextSelected = useCallback(
    (sel: PendingSelection) => {
      setPendingSelection((prev) => (prev?.cfiRange === sel.cfiRange ? prev : sel));
      setPendingColor(DEFAULT_HIGHLIGHT_COLOR);
      setNoteOpen(false);
      setNoteDraft("");

      // Create a local-only preview highlight immediately so the selection remains visible even if
      // the browser selection highlight clears when focus shifts.
      const preview = createDraftHighlight({
        cfiRange: sel.cfiRange,
        text: sel.text,
        color: DEFAULT_HIGHLIGHT_COLOR,
      });
      const previewHighlight: LocalHighlight = { ...preview, serverSaveStatus: undefined };

      setHighlights((prev) => {
        if (prev.some((h) => h.cfiRange === sel.cfiRange)) return prev;
        return [previewHighlight, ...prev];
      });
      setPreviewHighlightId(previewHighlight.id);
    },
    [createDraftHighlight],
  );

  const cancelPendingSelection = useCallback(() => {
    if (previewHighlightId) {
      setHighlights((prev) => prev.filter((h) => h.id !== previewHighlightId));
    }
    setPendingSelection(null);
    setPendingColor(DEFAULT_HIGHLIGHT_COLOR);
    setNoteOpen(false);
    setNoteDraft("");
    setPreviewHighlightId(null);
  }, [previewHighlightId]);

  const createHighlightFromPending = useCallback((color?: HighlightColor) => {
    if (!pendingSelection) return;
    const finalColor = color ?? pendingColor;
    setHighlights((prev) => {
      // Upgrade preview highlight if present, otherwise create new.
      if (previewHighlightId) {
        return prev.map((h) =>
          h.id === previewHighlightId
            ? {
                ...h,
                color: finalColor,
                serverSaveStatus: "unsaved",
                createIdempotencyKey: h.createIdempotencyKey ?? createIdempotencyKey(),
              }
            : h,
        );
      }
      if (prev.some((h) => h.cfiRange === pendingSelection.cfiRange)) return prev;
      const h = createDraftHighlight({ cfiRange: pendingSelection.cfiRange, text: pendingSelection.text, color: finalColor });
      return [h, ...prev];
    });
    setPendingSelection(null);
    setPendingColor(DEFAULT_HIGHLIGHT_COLOR);
    setPreviewHighlightId(null);
  }, [createDraftHighlight, highlights, pendingColor, pendingSelection]);

  const createNoteFromPending = useCallback((color?: HighlightColor) => {
    if (!pendingSelection) return;
    const note = noteDraft.trim();
    const finalColor = color ?? pendingColor;
    setHighlights((prev) => {
      if (previewHighlightId) {
        return prev.map((h) =>
          h.id === previewHighlightId
            ? {
                ...h,
                note: note || undefined,
                color: finalColor,
                serverSaveStatus: "unsaved",
                createIdempotencyKey: h.createIdempotencyKey ?? createIdempotencyKey(),
              }
            : h,
        );
      }
      if (prev.some((h) => h.cfiRange === pendingSelection.cfiRange)) return prev;
      const h = createDraftHighlight({
        cfiRange: pendingSelection.cfiRange,
        text: pendingSelection.text,
        note: note || undefined,
        color: finalColor,
      });
      return [h, ...prev];
    });
    setPendingSelection(null);
    setPendingColor(DEFAULT_HIGHLIGHT_COLOR);
    setNoteOpen(false);
    setNoteDraft("");
    setPreviewHighlightId(null);
  }, [createDraftHighlight, highlights, noteDraft, pendingColor, pendingSelection]);

  const removeLocalAnnotation = useCallback(
    (id: string) => {
      setHighlights((prev) => prev.filter((x) => x.id !== id));
      if (selectedHighlightId === id) setSelectedHighlightId(null);
    },
    [selectedHighlightId],
  );

  const clearLocalState = useCallback(() => {
    setHighlights([]);
    setSelectedHighlightId(null);
    setPendingSelection(null);
    setPendingColor(DEFAULT_HIGHLIGHT_COLOR);
    setNoteOpen(false);
    setNoteDraft("");
    setServerAnnotationPaging(null);
    setLoadMoreAnnotationsError(null);
    setLoadingMoreAnnotations(false);
  }, []);

  const loadedServerAnnotations = useMemo(
    () => highlights.filter((h) => Boolean(h.serverAnnotationId)).length,
    [highlights],
  );

  const serverPageInfo = useMemo(() => {
    if (!serverAnnotationPaging) return null;
    return {
      count: serverAnnotationPaging.count ?? 0,
      loaded: loadedServerAnnotations,
      next: serverAnnotationPaging.next,
      loading: loadingMoreAnnotations,
      error: loadMoreAnnotationsError,
    };
  }, [loadedServerAnnotations, loadMoreAnnotationsError, loadingMoreAnnotations, serverAnnotationPaging]);

  return {
    highlights,
    selectedHighlightId,
    setSelectedHighlightId,
    pendingSelection,
    pendingColor,
    setPendingColor,
    noteOpen,
    setNoteOpen,
    noteDraft,
    setNoteDraft,
    onTextSelected,
    cancelPendingSelection,
    createHighlightFromPending,
    createNoteFromPending,
    saveHighlightToSession,
    deleteHighlightFromSession,
    updateSavedAnnotationNote,
    removeLocalAnnotation,
    serverPageInfo,
    loadMoreSavedAnnotations,
    loadedServerAnnotations,
    clearLocalState,
  };
}
