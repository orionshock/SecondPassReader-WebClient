import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SecondPassClient, ReadingAnnotation } from "@secondpass/client";
import type { ReaderHighlightMark } from "../domain/types";
import {
  getAnnotationColor,
  getAnnotationDescribingText,
  getAnnotationFragmentCfi,
  getAnnotationNoteText,
  getAnnotationTimestamp,
  isBookmarkAnnotation,
  isHighlightAnnotation,
  toReaderAnnotation,
} from "../annotations/annotationUtils";

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

export type PreviousSessionAnnotationItem =
  | { kind: "highlight"; id: string; cfiRange: string; text: string; note?: string; color?: string; timestamp?: string }
  | { kind: "bookmark"; id: string; cfi: string; timestamp?: string };

export type PreviousSessionAnnotationGroup = {
  sessionId: string;
  label: string;
  highlightCount: number;
  selected: boolean;
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  items?: PreviousSessionAnnotationItem[];
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

function toPreviousSessionItems(annotations: ReadingAnnotation[]): PreviousSessionAnnotationItem[] {
  const out: PreviousSessionAnnotationItem[] = [];
  for (const a of annotations) {
    const timestamp = getAnnotationTimestamp(a) ?? undefined;
    if (isBookmarkAnnotation(a)) {
      const cfi = getAnnotationFragmentCfi(a);
      if (!cfi) continue;
      out.push({ kind: "bookmark", id: a.id, cfi, timestamp });
      continue;
    }
    if (isHighlightAnnotation(a)) {
      const ra = toReaderAnnotation(a);
      if (ra?.kind !== "highlight") continue;
      const note = getAnnotationNoteText(a) ?? undefined;
      const color = getAnnotationColor(a) ?? undefined;
      out.push({
        kind: "highlight",
        id: ra.id,
        cfiRange: ra.cfiRange,
        text: (getAnnotationDescribingText(a) ?? ra.text ?? "").trim(),
        note,
        color,
        timestamp,
      });
    }
  }
  return out;
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
  const [cacheVersion, setCacheVersion] = useState(0);

  const bump = useCallback(() => setCacheVersion((n) => n + 1), []);

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
  }, [sessionSummaries, cacheVersion]);

  const previousAnnotationGroups: PreviousSessionAnnotationGroup[] = useMemo(() => {
    const selected = new Set(selectedPreviousSessionIds);
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
      const items = cached?.status === "ready" && cached.annotations ? toPreviousSessionItems(cached.annotations) : undefined;
      return { sessionId: s.sessionId, label, highlightCount, selected: selected.has(s.sessionId), status, error: cached?.error, items };
    });
  }, [cacheVersion, selectedPreviousSessionIds, sessionSummaries]);

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
    previousAnnotationGroups,
    selectedPreviousSessionIds,
    togglePreviousSession,
    selectedHighlightMarks,
  };
}
