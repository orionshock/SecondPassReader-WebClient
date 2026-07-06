import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SecondPassClient, ReadingAnnotation } from "@secondpass/client";
import type { ReaderHighlightMark, ReaderLocationDescription, ReaderTocItem } from "../domain/types";
import { getAnnotationFragmentCfi } from "../annotations/annotationUtils";
import { loadMarginaliaLayerPreferences, saveMarginaliaLayerPreferences } from "../../../storage/marginaliaLayerPreferences";
import { describeCfiBestEffort } from "./readerCfiDescriptions";
import {
  toPreviousSessionHighlightMarks,
  toPreviousSessionItems,
  type PreviousSessionLocationDescriptionCacheEntry,
} from "./previousSessionAnnotationItems";
import {
  getPreviousSessionHighlightCount,
  sortPreviousSessionSummariesByUpdatedAt,
  stripPreviousSessionUpdatedAt,
  toPreviousSessionAnnotationGroup,
  toPreviousSessionLayerSummary,
  toPreviousSessionSummary,
  type PreviousSessionAnnotationGroup,
  type PreviousSessionLayerSummary,
  type PreviousSessionSummaryViewModel,
} from "./previousSessionViewModels";

export type { PreviousSessionAnnotationGroup, PreviousSessionLayerSummary } from "./previousSessionViewModels";
export type { PreviousSessionAnnotationItem } from "./previousSessionAnnotationItems";

type CachedSessionAnnotations = {
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  annotations?: ReadingAnnotation[];
  highlightMarks?: ReaderHighlightMark[];
  highlightCount?: number;
};

async function fetchAllAnnotationsForSession(args: {
  spl: SecondPassClient;
  sessionId: string;
}): Promise<ReadingAnnotation[]> {
  const out: ReadingAnnotation[] = [];
  let page = 1;
  let next: string | null = null;
  // v1: use pagination metadata if present; cap pages defensively.
  const MAX_PAGES = 25;

  do {
    // eslint-disable-next-line no-await-in-loop
    const resp = await args.spl.reading.annotations.list({
      sessionId: args.sessionId,
      kind: ["bookmark", "highlight"],
      ordering: "-created",
      page,
    });
    for (const a of resp.results ?? []) out.push(a as unknown as ReadingAnnotation);
    next = (resp as any).next ?? null;
    page += 1;
  } while (next && page <= MAX_PAGES);

  return out;
}

export function usePreviousSessionLayers(args: {
  spl?: SecondPassClient | null;
  bookId: string | number | null;
  currentSessionId: string | null;
  describeCfi?: ((cfi: string) => Promise<ReaderLocationDescription>) | null;
  toc?: ReaderTocItem[] | null;
  bookTitle?: string | null;
}) {
  const [listStatus, setListStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [listError, setListError] = useState<string | null>(null);
  const [sessionSummaries, setSessionSummaries] = useState<PreviousSessionSummaryViewModel[]>([]);

  const [selectedPreviousSessionIds, setSelectedPreviousSessionIds] = useState<string[]>([]);
  const cacheRef = useRef<Map<string, CachedSessionAnnotations>>(new Map());
  const [cacheVersion, setCacheVersion] = useState(0);
  const descriptionCacheRef = useRef<Map<string, PreviousSessionLocationDescriptionCacheEntry>>(new Map());
  const descriptionGenerationRef = useRef(0);
  const [descriptionCacheVersion, setDescriptionCacheVersion] = useState(0);

  const bump = useCallback(() => setCacheVersion((n) => n + 1), []);
  const bumpDescriptionCache = useCallback(() => setDescriptionCacheVersion((n) => n + 1), []);

  useEffect(() => {
    const bookId = args.bookId;
    if (bookId == null) {
      setSelectedPreviousSessionIds([]);
      return;
    }

    descriptionCacheRef.current.clear();
    descriptionGenerationRef.current += 1;
    bumpDescriptionCache();
    setSelectedPreviousSessionIds(loadMarginaliaLayerPreferences(bookId));
  }, [args.bookId, bumpDescriptionCache]);

  useEffect(() => {
    if (!args.spl) return;
    const bookId = args.bookId;
    if (bookId == null) return;

    setListStatus("loading");
    setListError(null);

    let cancelled = false;
    void (async () => {
      try {
        const resp = await args.spl!.reading.sessions.list({ bookId, pageSize: 100 });
        if (cancelled) return;
        const currentId = args.currentSessionId ?? "";
        const results = resp.results ?? [];
        const items = sortPreviousSessionSummariesByUpdatedAt(
          results
            .map((s: any) => toPreviousSessionSummary(s))
            .filter((x) => Boolean(x.sessionId && x.sessionId !== currentId)),
        ).map(stripPreviousSessionUpdatedAt);

        setSessionSummaries(items);
        setListStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setListStatus("error");
        setListError(e instanceof Error ? e.message : "Failed to list previous sessions.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [args.bookId, args.currentSessionId, args.spl]);

  const availableSessionIds = useMemo(() => {
    return sessionSummaries.map((s) => s.sessionId);
  }, [sessionSummaries]);

  const ensureLoaded = useCallback(
    async (sessionId: string) => {
      if (!args.spl) return;
      const id = sessionId.trim();
      if (!id) return;

      const existing = cacheRef.current.get(id);
      if (existing?.status === "loading" || existing?.status === "ready") return;

      cacheRef.current.set(id, { status: "loading" });
      bump();
      try {
        const annotations = await fetchAllAnnotationsForSession({ spl: args.spl, sessionId: id });
        const { marks, highlightCount } = toPreviousSessionHighlightMarks(annotations, id);
        cacheRef.current.set(id, { status: "ready", annotations, highlightMarks: marks, highlightCount });
      } catch (e) {
        cacheRef.current.set(id, { status: "error", error: e instanceof Error ? e.message : "Failed to load annotations." });
      } finally {
        bump();
      }
    },
    [args.spl, bump],
  );

  useEffect(() => {
    const bookId = args.bookId;
    if (bookId == null) return;
    if (listStatus !== "ready") return;

    const available = new Set(availableSessionIds);
    const nextSelectedIds = selectedPreviousSessionIds.filter((id, index, arr) => {
      return available.has(id) && arr.indexOf(id) === index;
    });

    const changed =
      nextSelectedIds.length !== selectedPreviousSessionIds.length ||
      nextSelectedIds.some((id, index) => id !== selectedPreviousSessionIds[index]);

    if (changed) {
      setSelectedPreviousSessionIds(nextSelectedIds);
      return;
    }

    saveMarginaliaLayerPreferences(bookId, nextSelectedIds);
    for (const sessionId of nextSelectedIds) {
      void ensureLoaded(sessionId);
    }
  }, [args.bookId, availableSessionIds, ensureLoaded, listStatus, selectedPreviousSessionIds]);

  const togglePreviousSession = useCallback(
    (sessionId: string) => {
      const id = sessionId.trim();
      if (!id) return;
      setSelectedPreviousSessionIds((prev) => {
        const willAdd = !prev.includes(id);
        const next = willAdd ? [...prev, id] : prev.filter((x) => x !== id);
        if (willAdd) void ensureLoaded(id);
        return next;
      });
    },
    [ensureLoaded],
  );

  useEffect(() => {
    const describeCfi = args.describeCfi;
    if (!describeCfi) return;

    const cfiSet = new Set<string>();
    for (const sessionId of selectedPreviousSessionIds) {
      const cached = cacheRef.current.get(sessionId);
      if (cached?.status !== "ready" || !cached.annotations) continue;
      for (const annotation of cached.annotations) {
        const cfi = getAnnotationFragmentCfi(annotation);
        if (cfi) cfiSet.add(cfi);
      }
    }
    if (cfiSet.size === 0) return;

    const generation = descriptionGenerationRef.current;
    for (const cfi of cfiSet) {
      const existing = descriptionCacheRef.current.get(cfi);
      if (existing?.status === "loading") continue;
      if (existing?.status === "ready" && existing.value.href) continue;
      descriptionCacheRef.current.set(cfi, { status: "loading" });
      bumpDescriptionCache();
      void (async () => {
        try {
          const value = await describeCfiBestEffort(describeCfi, cfi);
          if (descriptionGenerationRef.current !== generation) {
            return;
          }
          descriptionCacheRef.current.set(cfi, { status: "ready", value });
        } catch {
          if (descriptionGenerationRef.current !== generation) {
            return;
          }
          descriptionCacheRef.current.set(cfi, { status: "error" });
        } finally {
          if (descriptionGenerationRef.current === generation) bumpDescriptionCache();
        }
      })();
    }
  }, [args.describeCfi, args.toc, bumpDescriptionCache, cacheVersion, selectedPreviousSessionIds]);

  const previousLayers: PreviousSessionLayerSummary[] = useMemo(() => {
    return sessionSummaries.map((s) => {
      const cached = cacheRef.current.get(s.sessionId);
      const status = cached?.status ?? "idle";
      const highlightCount = getPreviousSessionHighlightCount({
        cachedHighlightCount: cached?.highlightCount,
        annotationCount: s.annotationCount,
      });
      return toPreviousSessionLayerSummary({ summary: s, highlightCount, status, error: cached?.error });
    });
  }, [sessionSummaries, cacheVersion]);

  const previousAnnotationGroups: PreviousSessionAnnotationGroup[] = useMemo(() => {
    const selected = new Set(selectedPreviousSessionIds);
    return sessionSummaries.map((s) => {
      const cached = cacheRef.current.get(s.sessionId);
      const status = cached?.status ?? "idle";
      const highlightCount = getPreviousSessionHighlightCount({
        cachedHighlightCount: cached?.highlightCount,
        annotationCount: s.annotationCount,
      });
      const items =
        cached?.status === "ready" && cached.annotations
          ? toPreviousSessionItems(cached.annotations, descriptionCacheRef.current, args.toc, args.bookTitle)
          : undefined;
      return toPreviousSessionAnnotationGroup({
        summary: s,
        highlightCount,
        selected: selected.has(s.sessionId),
        status,
        error: cached?.error,
        items,
      });
    });
  }, [args.bookTitle, args.toc, cacheVersion, descriptionCacheVersion, selectedPreviousSessionIds, sessionSummaries]);

  const selectedHighlightMarks: ReaderHighlightMark[] = useMemo(() => {
    const selected = new Set(selectedPreviousSessionIds);
    const out: ReaderHighlightMark[] = [];
    for (const sid of selected) {
      const cached = cacheRef.current.get(sid);
      if (cached?.status !== "ready" || !cached.highlightMarks) continue;
      out.push(...cached.highlightMarks);
    }
    return out;
  }, [cacheVersion, selectedPreviousSessionIds]);

  return {
    listStatus,
    listError,
    previousLayers,
    previousAnnotationGroups,
    selectedPreviousSessionIds,
    togglePreviousSession,
    selectedHighlightMarks,
  };
}
