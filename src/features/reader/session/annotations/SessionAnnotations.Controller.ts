import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MarginaliaAnnotation, SecondPassClient } from "@secondpass/client";
import type { OpenedBook } from "../../Reader.Types";
import type { ReaderHighlightMark, ReaderLocation, ReaderLocationDescription, ReaderTocItem } from "../../domain/ReaderDomain.Types";
import type { HighlightViewModel } from "../../annotations/ReaderAnnotationViewModels.Types";
import type { ReaderBookmark } from "../../annotations/ReaderBookmark.Mapper";
import type { ReaderBookmarkViewModel } from "../../annotations/ReaderBookmark.Presenter";
import { findReaderBookmarkAtCfi } from "../../annotations/ReaderAnnotationSelectors.Queries";
import { describeCfiBestEffort } from "../ReadingSessionCfiDescriptions.Queries";
import {
  buildSessionBookmarkViewModels,
  buildSessionHighlightMarks,
  buildSessionHighlightViewModels,
  sortSessionAnnotationItems,
  sortSessionAnnotations,
  toSessionAnnotationBookmarks,
  toSessionAnnotationHighlights,
  type SessionAnnotationDescriptionEntry,
} from "./SessionAnnotations.Presenter";
import { mapOfflineReaderAnnotations } from "./OfflineReaderAnnotations.Mapper";
import { debugWarn } from "../../../../lib/debug/DebugLogger.Diagnostics";

export type SessionAnnotations = {
  raw: MarginaliaAnnotation[];
  setRaw: React.Dispatch<React.SetStateAction<MarginaliaAnnotation[]>>;
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

export function getSeedAnnotationsFromOpen(annotations: MarginaliaAnnotation[] | null | undefined): MarginaliaAnnotation[] | null {
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
  const [rawEntry, setRawEntry] = useState<{ key: string; annotations: MarginaliaAnnotation[] }>(() => ({
    key: activeKey,
    annotations: [],
  }));
  const raw = rawEntry.key === activeKey ? rawEntry.annotations : [];
  const setRaw = useCallback<React.Dispatch<React.SetStateAction<MarginaliaAnnotation[]>>>(
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

  const [bookmarkDescriptions, setBookmarkDescriptions] = useState<Record<string, SessionAnnotationDescriptionEntry>>({});
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

  const sortedRaw = useMemo(() => sortSessionAnnotations(raw), [raw]);

  const lastSeedKeyRef = useRef<string>("");
  useEffect(() => {
    if (lastSeedKeyRef.current === activeKey) return;
    const seeded = args.openedBook.bootstrap.kind === "server"
      ? getSeedAnnotationsFromOpen(args.openedBook.bootstrap.marginalia.annotations)
      : mapOfflineReaderAnnotations(args.openedBook.bootstrap.continuity.annotations);
    if (!seeded) return;
    lastSeedKeyRef.current = activeKey;
    setRaw(seeded);
  }, [activeKey, args.openedBook.bootstrap, setRaw]);

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
        const res = await args.spl!.marginalia.sessions.getAnnotations(sessionId);
        const all = res.annotations;
        if (cancelled) return;
        if (loadGenerationRef.current !== generation) return;
        setRaw(all);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        if (loadGenerationRef.current !== generation) return;
        debugWarn("reader", "current Reading Session annotations could not be loaded", {
          bookId: String(args.openedBook.book.id),
          sessionId,
          error: e,
        });
        setStatus("error");
        setError("Couldn't load annotations. Reopen the reader to try again.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeKey, args.spl, args.sessionId, setRaw]);

  const bookmarks: ReaderBookmark[] = useMemo(
    () => toSessionAnnotationBookmarks(sortedRaw),
    [sortedRaw],
  );

  const currentBookmark = useMemo(
    () => findReaderBookmarkAtCfi(bookmarks, args.location?.cfi),
    [args.location?.cfi, bookmarks],
  );

  const highlights = useMemo(
    () => toSessionAnnotationHighlights(sortedRaw),
    [sortedRaw],
  );

  // Descriptions enrich display only and must not move the rendition. Generation guards reject stale Book results.
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
    return buildSessionBookmarkViewModels({
      bookmarks,
      sortedRaw,
      descriptions: bookmarkDescriptions,
      currentCfi: args.location?.cfi,
      currentBookProgress: args.location?.bookProgress,
      toc: args.toc,
      bookTitle: args.openedBook.book.title,
      describeCfiAvailable: Boolean(describeCfi),
    });
  }, [args.location?.bookProgress, args.location?.cfi, args.openedBook.book.title, args.toc, bookmarks, bookmarkDescriptions, describeCfi, sortedRaw]);

  const highlightViewModels = useMemo(() => {
    return buildSessionHighlightViewModels({
      highlights,
      sortedRaw,
      descriptions: bookmarkDescriptions,
      toc: args.toc,
      bookTitle: args.openedBook.book.title,
    });
  }, [args.openedBook.book.title, args.toc, bookmarkDescriptions, highlights, sortedRaw]);

  const highlightMarks: ReaderHighlightMark[] = useMemo(
    () => buildSessionHighlightMarks(highlightViewModels),
    [highlightViewModels],
  );

  const items: Array<ReaderBookmarkViewModel | HighlightViewModel> = useMemo(
    () => sortSessionAnnotationItems(bookmarkViewModels, highlightViewModels),
    [bookmarkViewModels, highlightViewModels],
  );

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
