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
import { describeCfiBestEffort, toReaderCfiLocationDisplay } from "./readerCfiDescriptions";

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

  items: Array<ReaderBookmarkViewModel | HighlightViewModel>;
};

export function getSessionAnnotationsActiveKey(input: {
  bookId: string | number;
  objectUrl: string;
  sessionId: string | null;
}): string {
  return `${String(input.bookId)}|${input.objectUrl}|${input.sessionId ?? ""}`;
}

export function getSeedAnnotationsFromOpen(annotations: ReadingAnnotation[] | null | undefined): ReadingAnnotation[] | null {
  if (!Array.isArray(annotations)) return null;
  return [...annotations];
}

export function useSessionAnnotations(args: {
  openedBook: OpenedBook;
  spl?: SecondPassClient | null;
  sessionId: string | null;
  location: ReaderLocation | null;
  toc: ReaderTocItem[] | null;
}) : SessionAnnotations {
  const activeKey = getSessionAnnotationsActiveKey({
    bookId: args.openedBook.book.id,
    objectUrl: args.openedBook.objectUrl,
    sessionId: args.sessionId,
  });
  const [rawEntry, setRawEntry] = useState<{ key: string; annotations: ReadingAnnotation[] }>(() => ({
    key: activeKey,
    annotations: [],
  }));
  const raw = rawEntry.key === activeKey ? rawEntry.annotations : [];
  const setRaw = useCallback<React.Dispatch<React.SetStateAction<ReadingAnnotation[]>>>(
    (value) => {
      setRawEntry((prev) => {
        const current = prev.key === activeKey ? prev.annotations : [];
        const annotations = typeof value === "function" ? value(current) : value;
        return { key: activeKey, annotations };
      });
    },
    [activeKey],
  );
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const [describeCfi, setDescribeCfi] = useState<((cfi: string) => Promise<ReaderLocationDescription>) | null>(null);
  const [locationsReady, setLocationsReady] = useState(false);

  const [bookmarkDescriptions, setBookmarkDescriptions] = useState<
    Record<string, { status: "idle" | "loading" | "ready" | "error"; value?: ReaderLocationDescription }>
  >({});
  const descriptionGenerationRef = useRef(0);
  const loadGenerationRef = useRef(0);
  const bookmarkDescriptionsRef = useRef(bookmarkDescriptions);
  useEffect(() => {
    bookmarkDescriptionsRef.current = bookmarkDescriptions;
  }, [bookmarkDescriptions]);

  useEffect(() => {
    descriptionGenerationRef.current += 1;
    loadGenerationRef.current += 1;
    setRawEntry({ key: activeKey, annotations: [] });
    setStatus("idle");
    setError(null);
    setBookmarkDescriptions({});
  }, [activeKey]);

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

  // Seed from readingOpen response (first page) immediately when available.
  const lastSeedKeyRef = useRef<string>("");
  useEffect(() => {
    const open = args.openedBook.readingOpen;
    const id = open?.session?.id ?? "";
    if (!id) return;
    if (lastSeedKeyRef.current === activeKey) return;
    const seeded = getSeedAnnotationsFromOpen(open?.annotations?.results as unknown as ReadingAnnotation[] | undefined);
    if (!seeded) return;
    lastSeedKeyRef.current = activeKey;
    setRaw(seeded);
  }, [activeKey, args.openedBook.readingOpen, setRaw]);

  // Load annotations for the session (non-blocking).
  useEffect(() => {
    if (!args.spl) return;
    const sessionId = args.sessionId;
    if (!sessionId) return;
    const generation = loadGenerationRef.current;
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
            kind: ["bookmark", "highlight"],
            ordering: "-created",
          });
          all.push(...(res.results as unknown as ReadingAnnotation[]));
          if (!res.next) break;
          page += 1;
        }
        if (cancelled) return;
        if (loadGenerationRef.current !== generation) return;
        setRaw(all);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        if (loadGenerationRef.current !== generation) return;
        setStatus("error");
        setError(e instanceof Error ? e.message : "Failed to load annotations.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeKey, args.spl, args.sessionId, setRaw]);

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

    const generation = descriptionGenerationRef.current;

    const current = bookmarkDescriptionsRef.current;
    const toDescribe = [...bookmarks.map((b) => b.cfi), ...highlights.map((h) => h.cfiRange)].filter((cfi) => {
      const entry = current[cfi];
      if (!entry) return true;
      if (entry.status === "error") return true;
      if (entry.status === "ready" && !entry.value?.href) return true;
      // Once locations are generated, refresh descriptions that previously
      // lacked locations-derived metadata (e.g. approximate bookProgress).
      if (locationsReady && entry.status === "ready" && entry.value && entry.value.bookProgress == null) return true;
      return false;
    });

    for (const cfi of toDescribe) {
      setBookmarkDescriptions((prev) => {
        const existing = prev[cfi];
        if (existing?.status === "loading") return prev;
        if (
          existing?.status === "ready" &&
          existing.value?.href &&
          !(locationsReady && existing.value && existing.value.bookProgress == null)
        ) {
          return prev;
        }
        return { ...prev, [cfi]: { status: "loading" } };
      });

      void (async () => {
        try {
          const desc = await describeCfiBestEffort(describeCfi, cfi);
          if (descriptionGenerationRef.current !== generation) {
            return;
          }
          setBookmarkDescriptions((prev) => ({ ...prev, [cfi]: { status: "ready", value: desc } }));
        } catch {
          if (descriptionGenerationRef.current !== generation) {
            return;
          }
          setBookmarkDescriptions((prev) => ({ ...prev, [cfi]: { status: "error" } }));
        }
      })();
    }
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
        bookTitle: args.openedBook.book.title,
        description: entry?.value ?? null,
        fallbackBookProgress: args.location?.bookProgress ?? null,
        timestamp,
        descriptionStatus: entry?.status ?? (describeCfi ? "idle" : "idle"),
      });
    });
  }, [args.location?.bookProgress, args.location?.cfi, args.openedBook.book.title, args.toc, bookmarks, bookmarkDescriptions, describeCfi, sortedRaw]);

  const highlightViewModels = useMemo(() => {
    return highlights.map((h) => {
      const rawA = sortedRaw.find((a) => a.id === h.id) ?? null;
      const note = rawA ? getAnnotationNoteText(rawA) : null;
      const color = rawA ? getAnnotationColor(rawA) : null;
      const timestamp = rawA ? getAnnotationTimestamp(rawA) : null;
      const entry = bookmarkDescriptions[h.cfiRange];
      const locationDisplay = toReaderCfiLocationDisplay({
        description: entry?.value ?? null,
        toc: args.toc,
        bookTitle: args.openedBook.book.title,
      });

      return {
        kind: "highlight" as const,
        id: h.id,
        cfiRange: h.cfiRange,
        text: h.text,
        note: note ?? undefined,
        color: color ?? undefined,
        timestamp: timestamp ?? undefined,
        label: locationDisplay.label,
        labelParts: locationDisplay.labelParts,
        descriptionStatus: entry?.status ?? "idle",
      };
    });
  }, [args.openedBook.book.title, args.toc, bookmarkDescriptions, highlights, sortedRaw]);

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
      items,
    }),
    [
      bookmarks,
      bookmarkViewModels,
      currentBookmark,
      error,
      handleDescribeCfiReady,
      highlightMarks,
      highlightViewModels,
      items,
      onLocationsReady,
      raw,
      status,
    ],
  );
}
