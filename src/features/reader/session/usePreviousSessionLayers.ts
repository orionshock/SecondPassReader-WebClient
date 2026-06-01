import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SecondPassClient, ReadingAnnotation } from "@secondpass/client";
import type { ReaderHighlightMark } from "../domain/types";
import { getAnnotationColor, getAnnotationNoteText, isHighlightAnnotation, toReaderAnnotation } from "../annotations/annotationUtils";

export type PreviousSessionLayerSummary = {
  sessionId: string;
  label: string;
  highlightCount: number;
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
};

type CachedSessionAnnotations = {
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  annotations?: ReadingAnnotation[];
  highlightMarks?: ReaderHighlightMark[];
  highlightCount?: number;
};

function toSessionLabel(input: { startedAt?: string | null; updatedAt?: string | null; createdAt?: string | null; completedAt?: string | null; fallbackId: string }): string {
  const ts =
    (typeof input.updatedAt === "string" ? input.updatedAt : null) ??
    (typeof input.completedAt === "string" ? input.completedAt : null) ??
    (typeof input.startedAt === "string" ? input.startedAt : null) ??
    (typeof input.createdAt === "string" ? input.createdAt : null);
  if (!ts) return input.fallbackId;
  const ms = Date.parse(ts);
  if (!Number.isFinite(ms)) return input.fallbackId;
  return new Date(ms).toLocaleString();
}

function toHighlightMarks(annotations: ReadingAnnotation[]): { marks: ReaderHighlightMark[]; highlightCount: number } {
  const marks: ReaderHighlightMark[] = [];
  let count = 0;
  for (const a of annotations) {
    if (!isHighlightAnnotation(a)) continue;
    const ra = toReaderAnnotation(a);
    if (ra?.kind !== "highlight") continue;
    const mark: ReaderHighlightMark = { id: ra.id, cfiRange: ra.cfiRange, text: ra.text ?? "" };
    const color = getAnnotationColor(a);
    if (color) mark.color = color;
    const note = getAnnotationNoteText(a);
    if (note) mark.note = note;
    marks.push(mark);
    count += 1;
  }
  return { marks: marks.filter((m) => Boolean(m.id && m.cfiRange)), highlightCount: count };
}

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
      motivation: ["bookmarking", "highlighting"],
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
}) {
  const [listStatus, setListStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [listError, setListError] = useState<string | null>(null);
  const [sessionSummaries, setSessionSummaries] = useState<Array<{ sessionId: string; label: string; annotationCount: number | null }>>([]);

  const [selectedPreviousSessionIds, setSelectedPreviousSessionIds] = useState<string[]>([]);
  const cacheRef = useRef<Map<string, CachedSessionAnnotations>>(new Map());
  const [, forceRerender] = useState(0);

  const bump = useCallback(() => forceRerender((n) => n + 1), []);

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
        const items = results
          .map((s: any) => {
            const sessionId = typeof s.id === "string" ? s.id : "";
            const label = toSessionLabel({
              updatedAt: s.updated_at ?? null,
              completedAt: s.completed_at ?? null,
              startedAt: s.started_at ?? null,
              createdAt: s.created_at ?? null,
              fallbackId: sessionId || "(unknown session)",
            });
            const annotationCount = typeof s.annotation_count === "number" ? s.annotation_count : null;
            return { sessionId, label, annotationCount, updatedAt: s.updated_at ?? null };
          })
          .filter((x) => Boolean(x.sessionId && x.sessionId !== currentId))
          .sort((a, b) => {
            const am = a.updatedAt ? Date.parse(a.updatedAt) : 0;
            const bm = b.updatedAt ? Date.parse(b.updatedAt) : 0;
            return (Number.isFinite(bm) ? bm : 0) - (Number.isFinite(am) ? am : 0);
          })
          .map(({ updatedAt, ...rest }) => rest);

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
        const { marks, highlightCount } = toHighlightMarks(annotations);
        cacheRef.current.set(id, { status: "ready", annotations, highlightMarks: marks, highlightCount });
      } catch (e) {
        cacheRef.current.set(id, { status: "error", error: e instanceof Error ? e.message : "Failed to load annotations." });
      } finally {
        bump();
      }
    },
    [args.spl, bump],
  );

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

  const previousLayers: PreviousSessionLayerSummary[] = useMemo(() => {
    return sessionSummaries.map((s) => {
      const cached = cacheRef.current.get(s.sessionId);
      const status = cached?.status ?? "idle";
      const highlightCount =
        typeof cached?.highlightCount === "number"
          ? cached.highlightCount
          : typeof s.annotationCount === "number"
            ? s.annotationCount
            : 0;
      const label = `${s.label} \u00B7 ${highlightCount} highlight${highlightCount === 1 ? "" : "s"}`;
      return { sessionId: s.sessionId, label, highlightCount, status, error: cached?.error };
    });
  }, [sessionSummaries]);

  const selectedHighlightMarks: ReaderHighlightMark[] = useMemo(() => {
    const selected = new Set(selectedPreviousSessionIds);
    const out: ReaderHighlightMark[] = [];
    for (const sid of selected) {
      const cached = cacheRef.current.get(sid);
      if (cached?.status !== "ready" || !cached.highlightMarks) continue;
      out.push(...cached.highlightMarks);
    }
    return out;
  }, [selectedPreviousSessionIds]);

  return {
    listStatus,
    listError,
    previousLayers,
    selectedPreviousSessionIds,
    togglePreviousSession,
    selectedHighlightMarks,
  };
}
