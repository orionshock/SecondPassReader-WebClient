import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSecondPassClient } from "@secondpass/client";
import type { ReadingAnnotationPage, ReadingSessionSummary } from "@secondpass/client";
import type { LocalHighlight } from "./types";
import { createLocalHighlightFromServerAnnotation } from "./readingAnnotationAdapter";

export type PreviousSessionLayer = {
  session: ReadingSessionSummary;
  checked: boolean;
  loading: boolean;
  error?: string;
  loadedCount: number;
  totalCount?: number;
  hasMore: boolean;
};

type LayerCache = {
  session: ReadingSessionSummary;
  annotationsPage?: ReadingAnnotationPage;
  highlights: LocalHighlight[];
  loading: boolean;
  error?: string;
};

export function usePreviousSessionLayers(input: {
  bookId: string | number | null;
  currentSessionId?: string | null;
  apiBaseUrl?: string;
  accessToken?: string;
  tokenType?: string;
}) {
  const cacheRef = useRef<Map<string, LayerCache>>(new Map());
  const [previousSessions, setPreviousSessions] = useState<ReadingSessionSummary[] | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [checkedSessionIds, setCheckedSessionIds] = useState<Set<string>>(new Set());
  const [bump, setBump] = useState(0);

  const apiReady = Boolean(input.apiBaseUrl && input.accessToken);
  const bookKey = input.bookId != null ? String(input.bookId) : "";

  useEffect(() => {
    // Reset on book change.
    setPreviousSessions(null);
    setSessionsError(null);
    setCheckedSessionIds(new Set());
    cacheRef.current = new Map();
    setBump((v) => v + 1);
  }, [bookKey]);

  useEffect(() => {
    if (!apiReady) return;
    if (!bookKey) return;
    let cancelled = false;
    setSessionsLoading(true);
    setSessionsError(null);

    void (async () => {
      try {
        const spl = createSecondPassClient({ apiBaseUrl: input.apiBaseUrl!, accessToken: input.accessToken!, tokenType: input.tokenType ?? "Bearer" });
        const page = await spl.reading.sessions.list({
          bookId: bookKey,
          isActive: false,
          pageSize: 50,
        });

        if (cancelled) return;
        const currentSessionId = input.currentSessionId ? String(input.currentSessionId) : "";
        const results = (page.results ?? []).filter((s) => String(s.id) !== currentSessionId);
        setPreviousSessions(results);
      } catch (e) {
        if (cancelled) return;
        setSessionsError(e instanceof Error ? e.message : "Failed to load previous sessions.");
        setPreviousSessions([]);
      } finally {
        if (!cancelled) setSessionsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiReady, bookKey, bump, input.accessToken, input.apiBaseUrl, input.currentSessionId, input.tokenType]);

  const toggleLayer = useCallback((sessionId: string) => {
    setCheckedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }, []);

  const ensureLayerLoaded = useCallback(
    async (sessionId: string) => {
      if (!apiReady) return;
      const sid = String(sessionId);
      const existing = cacheRef.current.get(sid);
      if (existing?.highlights?.length) return;
      if (existing?.loading) return;

      const session = previousSessions?.find((s) => String(s.id) === sid);
      if (!session) return;

      cacheRef.current.set(sid, { session, highlights: [], loading: true });
      setBump((v) => v + 1);
      try {
        const spl = createSecondPassClient({ apiBaseUrl: input.apiBaseUrl!, accessToken: input.accessToken!, tokenType: input.tokenType ?? "Bearer" });
        const page = await spl.reading.annotations.list({ sessionId: sid, page: 1 });

        const highlights: LocalHighlight[] = [];
        for (const ann of page.results ?? []) {
          const h = createLocalHighlightFromServerAnnotation(ann);
          if (!h) continue;
          highlights.push({
            ...h,
            id: `layer_${sid}_${h.id}`,
            readOnly: true,
            sourceSessionId: sid,
            sourceSessionLabel: (session.name ?? "").trim() || sid,
          });
        }

        cacheRef.current.set(sid, {
          session,
          annotationsPage: page,
          highlights,
          loading: false,
          error: undefined,
        });
      } catch (e) {
        cacheRef.current.set(sid, {
          session,
          highlights: [],
          loading: false,
          error: e instanceof Error ? e.message : "Failed to load session annotations.",
        });
      } finally {
        setBump((v) => v + 1);
      }
    },
    [apiReady, input.accessToken, input.apiBaseUrl, input.tokenType, previousSessions],
  );

  // When user checks a layer, kick off its fetch.
  useEffect(() => {
    if (!apiReady) return;
    for (const sid of Array.from(checkedSessionIds)) {
      void ensureLayerLoaded(sid);
    }
  }, [apiReady, checkedSessionIds, ensureLayerLoaded]);

  const loadMore = useCallback(
    async (sessionId: string) => {
      if (!apiReady) return;
      const sid = String(sessionId);
      const cache = cacheRef.current.get(sid);
      if (!cache || cache.loading) return;
      const nextUrl = cache.annotationsPage?.next;
      if (!nextUrl) return;

      cacheRef.current.set(sid, { ...cache, loading: true, error: undefined });
      setBump((v) => v + 1);
      try {
        // Parse next page number from URL (server provides absolute next URLs).
        const url = new URL(nextUrl);
        const pageRaw = url.searchParams.get("page");
        const pageNum = pageRaw ? Number(pageRaw) : NaN;
        const spl = createSecondPassClient({ apiBaseUrl: input.apiBaseUrl!, accessToken: input.accessToken!, tokenType: input.tokenType ?? "Bearer" });
        const page = await spl.reading.annotations.list({ sessionId: sid, page: Number.isFinite(pageNum) ? pageNum : undefined });

        const more: LocalHighlight[] = [];
        for (const ann of page.results ?? []) {
          const h = createLocalHighlightFromServerAnnotation(ann);
          if (!h) continue;
          more.push({
            ...h,
            id: `layer_${sid}_${h.id}`,
            readOnly: true,
            sourceSessionId: sid,
            sourceSessionLabel: (cache.session.name ?? "").trim() || sid,
          });
        }

        const dedup = new Map<string, LocalHighlight>();
        for (const h of cache.highlights) dedup.set(h.serverAnnotationId ?? h.id, h);
        for (const h of more) dedup.set(h.serverAnnotationId ?? h.id, h);

        cacheRef.current.set(sid, {
          ...cache,
          annotationsPage: page,
          highlights: Array.from(dedup.values()),
          loading: false,
        });
      } catch (e) {
        cacheRef.current.set(sid, {
          ...cache,
          loading: false,
          error: e instanceof Error ? e.message : "Failed to load more annotations.",
        });
      } finally {
        setBump((v) => v + 1);
      }
    },
    [apiReady, input.accessToken, input.apiBaseUrl, input.tokenType],
  );

  const layers: PreviousSessionLayer[] = useMemo(() => {
    const list = previousSessions ?? [];
    return list.map((s) => {
      const sid = String(s.id);
      const cache = cacheRef.current.get(sid);
      const checked = checkedSessionIds.has(sid);
      const loaded = cache?.highlights?.length ?? 0;
      const total = typeof (cache?.annotationsPage as any)?.count === "number" ? (cache!.annotationsPage as any).count : undefined;
      const hasMore = Boolean(cache?.annotationsPage?.next);
      return {
        session: s,
        checked,
        loading: checked ? Boolean(cache?.loading) : false,
        error: checked ? cache?.error : undefined,
        loadedCount: loaded,
        totalCount: total,
        hasMore,
      };
    });
  }, [checkedSessionIds, previousSessions, bump]);

  const layeredHighlights = useMemo(() => {
    const out: LocalHighlight[] = [];
    for (const sid of Array.from(checkedSessionIds)) {
      const cache = cacheRef.current.get(String(sid));
      if (!cache) continue;
      out.push(...(cache.highlights ?? []));
    }
    return out;
  }, [checkedSessionIds, bump]);

  return {
    apiReady,
    sessionsLoading,
    sessionsError,
    layers,
    checkedSessionIds,
    toggleLayer,
    loadMore,
    layeredHighlights,
  };
}
