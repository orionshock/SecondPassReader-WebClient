import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReadingAnnotation, SecondPassClient } from "@secondpass/client";
import type { OpenedBook } from "../types";
import type { ReaderHighlightMark, ReaderLocation, ReaderLocationDescription, ReaderTocItem } from "../domain/types";
import type { HighlightViewModel } from "../annotations/viewModels";
import {
  getAnnotationColor,
  getAnnotationNoteText,
  getAnnotationTimestamp,
  isHighlightAnnotation,
  toReaderAnnotation,
} from "../annotations/annotationUtils";
import { toBookmarkViewModel, toReaderBookmark, type ReaderBookmark, type ReaderBookmarkViewModel } from "../annotations/bookmarkUtils";

export type SessionAnnotations = {
  raw: ReadingAnnotation[];
  setRaw: React.Dispatch<React.SetStateAction<ReadingAnnotation[]>>;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  setError: (value: string | null) => void;
  setStatus: (value: "idle" | "loading" | "ready" | "error") => void;

  handleDescribeCfiReady: (fn: ((cfi: string) => Promise<ReaderLocationDescription>) | null) => void;
  onLocationsReady: () => void;

  bookmarks: ReaderBookmark[];
  currentBookmark: ReaderBookmark | null;

  bookmarkViewModels: ReaderBookmarkViewModel[];
  highlightViewModels: HighlightViewModel[];
  highlightMarks: ReaderHighlightMark[];

  highlightMarkLayers: {
    current: ReaderHighlightMark[];
    previous: Array<{ sessionId: string; label: string; highlightCount: number; marks: ReaderHighlightMark[] }>;
  };

  items: Array<ReaderBookmarkViewModel | HighlightViewModel>;
};

export function useSessionAnnotations(args: {
  openedBook: OpenedBook;
  spl?: SecondPassClient | null;
  sessionId: string | null;
  location: ReaderLocation | null;
  toc: ReaderTocItem[] | null;
}) : SessionAnnotations {
  const [raw, setRaw] = useState<ReadingAnnotation[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const [describeCfi, setDescribeCfi] = useState<((cfi: string) => Promise<ReaderLocationDescription>) | null>(null);
  const [locationsReady, setLocationsReady] = useState(false);

  const [bookmarkDescriptions, setBookmarkDescriptions] = useState<
    Record<string, { status: "idle" | "loading" | "ready" | "error"; value?: ReaderLocationDescription }>
  >({});
  const bookmarkDescriptionsRef = useRef(bookmarkDescriptions);
  useEffect(() => {
    bookmarkDescriptionsRef.current = bookmarkDescriptions;
  }, [bookmarkDescriptions]);

  const handleDescribeCfiReady = useCallback((fn: ((cfi: string) => Promise<ReaderLocationDescription>) | null) => {
    setDescribeCfi(() => fn);
    setLocationsReady(false);
  }, []);

  const onLocationsReady = useCallback(() => {
    setLocationsReady(true);
  }, []);

  const sortedRaw = useMemo(() => {
    const copy = [...raw];
    const tsMs = (a: ReadingAnnotation): number => {
      const s = getAnnotationTimestamp(a);
      if (!s) return 0;
      const ms = Date.parse(s);
      return Number.isFinite(ms) ? ms : 0;
    };
    copy.sort((a, b) => {
      const d = tsMs(b) - tsMs(a);
      if (d !== 0) return d;
      return String(b.id).localeCompare(String(a.id));
    });
    return copy;
  }, [raw]);

  const seedAnnotationsFromOpen = useCallback((annotations: ReadingAnnotation[] | null | undefined) => {
    const seeded: ReadingAnnotation[] = [];
    for (const a of annotations ?? []) seeded.push(a);
    if (seeded.length > 0) setRaw(seeded);
  }, []);

  // Seed from readingOpen response (first page) immediately when available.
  const lastSeedKeyRef = useRef<string>("");
  useEffect(() => {
    const open = args.openedBook.readingOpen;
    const id = open?.session?.id ?? "";
    if (!id) return;
    const key = `${args.openedBook.objectUrl}|${id}`;
    if (lastSeedKeyRef.current === key) return;
    lastSeedKeyRef.current = key;
    seedAnnotationsFromOpen(open?.annotations?.results as unknown as ReadingAnnotation[] | undefined);
  }, [args.openedBook.objectUrl, args.openedBook.readingOpen, seedAnnotationsFromOpen]);

  // Load annotations for the session (non-blocking).
  useEffect(() => {
    if (!args.spl) return;
    const sessionId = args.sessionId;
    if (!sessionId) return;
    setStatus("loading");
    setError(null);

    let cancelled = false;
    void (async () => {
      try {
        const all: ReadingAnnotation[] = [];
        let page = 1;
        for (let guard = 0; guard < 50; guard += 1) {
          const res = await args.spl!.reading.annotations.list({
            sessionId,
            page,
            // Standalone comment-only annotations are not supported. Highlights with notes
            // are still returned when filtering by "highlighting".
            motivation: ["bookmarking", "highlighting"],
            ordering: "-created",
          });
          all.push(...(res.results as unknown as ReadingAnnotation[]));
          if (!res.next) break;
          page += 1;
        }
        if (cancelled) return;
        setRaw(all);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setError(e instanceof Error ? e.message : "Failed to load annotations.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [args.spl, args.sessionId]);

  const bookmarks: ReaderBookmark[] = useMemo(() => {
    const out: ReaderBookmark[] = [];
    for (const a of sortedRaw) {
      const b = toReaderBookmark(a);
      if (b) out.push(b);
    }
    return out;
  }, [sortedRaw]);

  const currentBookmark = useMemo(() => {
    const cfi = args.location?.cfi?.trim() ?? "";
    if (!cfi) return null;
    // v1: exact CFI string match
    return bookmarks.find((b) => b.cfi === cfi) ?? null;
  }, [args.location?.cfi, bookmarks]);

  const highlights = useMemo(() => {
    const out: Array<{ id: string; cfiRange: string; text: string }> = [];
    for (const a of sortedRaw) {
      if (!isHighlightAnnotation(a)) continue;
      const ra = toReaderAnnotation(a);
      if (ra?.kind !== "highlight") continue;
      out.push({ id: ra.id, cfiRange: ra.cfiRange, text: ra.text ?? "" });
    }
    return out;
  }, [sortedRaw]);

  // Best-effort: describe bookmarks/highlights at runtime (no rendition jumps).
  // Important: avoid cancelling in-flight descriptions due to state updates.
  useEffect(() => {
    if (!describeCfi) return;
    if (bookmarks.length === 0 && highlights.length === 0) return;

    let cancelled = false;

    const current = bookmarkDescriptionsRef.current;
    const toDescribe = [...bookmarks.map((b) => b.cfi), ...highlights.map((h) => h.cfiRange)].filter((cfi) => {
      const entry = current[cfi];
      if (!entry) return true;
      if (entry.status === "error") return true;
      // Once locations are generated, refresh descriptions that previously
      // lacked locations-derived metadata (e.g. approximate bookProgress).
      if (locationsReady && entry.status === "ready" && entry.value && entry.value.bookProgress == null) return true;
      return false;
    });

    for (const cfi of toDescribe) {
      setBookmarkDescriptions((prev) => {
        const existing = prev[cfi];
        if (existing?.status === "loading") return prev;
        if (existing?.status === "ready" && !(locationsReady && existing.value && existing.value.bookProgress == null)) {
          return prev;
        }
        return { ...prev, [cfi]: { status: "loading" } };
      });

      void (async () => {
        try {
          const desc = await describeCfi(cfi);
          if (cancelled) return;
          setBookmarkDescriptions((prev) => ({ ...prev, [cfi]: { status: "ready", value: desc } }));
        } catch {
          if (cancelled) return;
          setBookmarkDescriptions((prev) => ({ ...prev, [cfi]: { status: "error" } }));
        }
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [bookmarks, describeCfi, highlights, locationsReady]);

  const bookmarkViewModels: ReaderBookmarkViewModel[] = useMemo(() => {
    return bookmarks.map((b) => {
      const rawA = sortedRaw.find((a) => a.id === b.id) ?? null;
      const timestamp = rawA ? getAnnotationTimestamp(rawA) : null;
      const entry = bookmarkDescriptions[b.cfi];
      return toBookmarkViewModel({
        bookmark: b,
        currentCfi: args.location?.cfi ?? null,
        toc: args.toc,
        description: entry?.value ?? null,
        fallbackBookProgress: args.location?.bookProgress ?? null,
        timestamp,
        descriptionStatus: entry?.status ?? (describeCfi ? "idle" : "idle"),
      });
    });
  }, [args.location?.bookProgress, args.location?.cfi, args.toc, bookmarks, bookmarkDescriptions, describeCfi, sortedRaw]);

  const highlightViewModels = useMemo(() => {
    return highlights.map((h) => {
      const rawA = sortedRaw.find((a) => a.id === h.id) ?? null;
      const note = rawA ? getAnnotationNoteText(rawA) : null;
      const color = rawA ? getAnnotationColor(rawA) : null;
      const timestamp = rawA ? getAnnotationTimestamp(rawA) : null;
      const entry = bookmarkDescriptions[h.cfiRange];
      const href = entry?.value?.href ?? undefined;
      const chapterLabel = href && args.toc ? findTocLabelForHref(args.toc, href) : null;
      const label = chapterLabel
        ? chapterLabel
        : typeof entry?.value?.bookProgress === "number" && Number.isFinite(entry.value.bookProgress)
          ? `${Math.round(entry.value.bookProgress * 100)}%`
          : "Saved location";

      return {
        kind: "highlight" as const,
        id: h.id,
        cfiRange: h.cfiRange,
        text: h.text,
        note: note ?? undefined,
        color: color ?? undefined,
        timestamp: timestamp ?? undefined,
        label,
        descriptionStatus: entry?.status ?? "idle",
      };
    });
  }, [args.toc, bookmarkDescriptions, highlights, sortedRaw]);

  const highlightMarks: ReaderHighlightMark[] = useMemo(() => {
    return highlightViewModels
      .map((h) => ({
        id: h.id,
        cfiRange: h.cfiRange,
        color: h.color,
        text: h.text,
        note: h.note,
      }))
      .filter((m) => Boolean(m.id && m.cfiRange));
  }, [highlightViewModels]);

  const highlightMarkLayers = useMemo(() => {
    const currentSessionId = args.sessionId ?? "";
    const marksBySessionId = new Map<string, ReaderHighlightMark[]>();
    const highlightCountBySessionId = new Map<string, number>();
    const lastActivityMsBySessionId = new Map<string, number>();

    for (const a of sortedRaw) {
      if (!isHighlightAnnotation(a)) continue;
      const ra = toReaderAnnotation(a);
      if (ra?.kind !== "highlight") continue;

      const sessionId = typeof (a as any)?.session === "string" ? String((a as any).session).trim() : "";
      if (!sessionId) continue;

      const mark: ReaderHighlightMark = { id: ra.id, cfiRange: ra.cfiRange, text: ra.text ?? "" };
      const color = getAnnotationColor(a);
      if (color) mark.color = color;
      const note = getAnnotationNoteText(a);
      if (note) mark.note = note;

      const list = marksBySessionId.get(sessionId) ?? [];
      list.push(mark);
      marksBySessionId.set(sessionId, list);

      highlightCountBySessionId.set(sessionId, (highlightCountBySessionId.get(sessionId) ?? 0) + 1);

      const ts = getAnnotationTimestamp(a);
      const ms = ts ? Date.parse(ts) : NaN;
      if (Number.isFinite(ms)) {
        const prev = lastActivityMsBySessionId.get(sessionId) ?? 0;
        if (ms > prev) lastActivityMsBySessionId.set(sessionId, ms);
      }
    }

    const current = currentSessionId ? (marksBySessionId.get(currentSessionId) ?? []) : highlightMarks;

    const previous: Array<{ sessionId: string; label: string; highlightCount: number; lastActivityMs: number; marks: ReaderHighlightMark[] }> = [];
    for (const [sessionId, marks] of marksBySessionId) {
      if (sessionId === currentSessionId) continue;
      const count = highlightCountBySessionId.get(sessionId) ?? marks.length;
      const lastMs = lastActivityMsBySessionId.get(sessionId) ?? 0;
      const when = lastMs > 0 ? new Date(lastMs).toLocaleString() : "Unknown date";
      const label = `${when} \u00B7 ${count} highlight${count === 1 ? "" : "s"}`;
      previous.push({ sessionId, label, highlightCount: count, lastActivityMs: lastMs, marks });
    }
    previous.sort((a, b) => {
      const d = (b.lastActivityMs || 0) - (a.lastActivityMs || 0);
      if (d !== 0) return d;
      return b.highlightCount - a.highlightCount;
    });

    return { current, previous: previous.map(({ lastActivityMs, ...rest }) => rest) };
  }, [args.sessionId, highlightMarks, sortedRaw]);

  const items: Array<ReaderBookmarkViewModel | HighlightViewModel> = useMemo(() => {
    const combined: Array<any> = [...bookmarkViewModels, ...highlightViewModels];
    const tsMs = (vm: { timestamp?: string; id: string }): number => {
      const s = typeof vm.timestamp === "string" ? vm.timestamp.trim() : "";
      if (!s) return 0;
      const ms = Date.parse(s);
      return Number.isFinite(ms) ? ms : 0;
    };
    combined.sort((a, b) => {
      const d = tsMs(b) - tsMs(a);
      if (d !== 0) return d;
      return String(b.id).localeCompare(String(a.id));
    });
    return combined as Array<ReaderBookmarkViewModel | HighlightViewModel>;
  }, [bookmarkViewModels, highlightViewModels]);

  return useMemo(
    () => ({
      raw,
      setRaw,
      status,
      error,
      setError,
      setStatus,
      handleDescribeCfiReady,
      onLocationsReady,
      bookmarks,
      currentBookmark,
      bookmarkViewModels,
      highlightViewModels,
      highlightMarks,
      highlightMarkLayers,
      items,
    }),
    [
      bookmarks,
      bookmarkViewModels,
      currentBookmark,
      error,
      handleDescribeCfiReady,
      highlightMarks,
      highlightMarkLayers,
      highlightViewModels,
      items,
      onLocationsReady,
      raw,
      status,
    ],
  );
}

function normalizeHrefForCompare(href: string): string {
  const s = href.trim();
  const hashIdx = s.indexOf("#");
  return (hashIdx >= 0 ? s.slice(0, hashIdx) : s).toLowerCase();
}

function findTocLabelForHref(toc: ReaderTocItem[], href: string): string | null {
  const target = normalizeHrefForCompare(href);
  const visit = (items: ReaderTocItem[]): { label: string; score: 2 | 1 } | null => {
    let best: { label: string; score: 2 | 1 } | null = null;
    for (const item of items) {
      if (item.href) {
        const candidate = normalizeHrefForCompare(item.href);
        if (candidate === target) return { label: item.label, score: 2 };
        if (candidate && target && (candidate.endsWith(target) || target.endsWith(candidate))) {
          if (!best) best = { label: item.label, score: 1 };
        }
      }
      if (item.children && item.children.length > 0) {
        const found = visit(item.children);
        if (found?.score === 2) return found;
        if (!best && found) best = found;
      }
    }
    return best;
  };

  return visit(toc)?.label ?? null;
}
