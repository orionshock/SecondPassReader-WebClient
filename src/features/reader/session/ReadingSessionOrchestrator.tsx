import type { ReaderSettings } from "../../../storage/readerSettings";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ReadingShell } from "../shell/ReadingShell";
import type { ReaderAnnotation, ReaderLocationTarget, ReadingShellEvent } from "../shell/types";
import type { ReaderLocation, ReaderSelection } from "../domain/types";
import type { ReaderTocItem } from "../domain/types";
import type { ReaderLocationDescription } from "../domain/types";
import type { ReadingSessionState } from "./types";
import type { OpenedBook } from "../types";
import { useReadingProgressAutosave } from "./useReadingProgressAutosave";
import type { SecondPassClient } from "@secondpass/client";
import type { ReadingAnnotation } from "@secondpass/client";
import { toBookmarkViewModel, toReaderBookmark, type ReaderBookmark, type ReaderBookmarkViewModel } from "../annotations/bookmarkUtils";
import { getAnnotationColor, getAnnotationNoteText, getAnnotationTimestamp, isHighlightAnnotation, toReaderAnnotation } from "../annotations/annotationUtils";
import type { ReaderHighlightMark } from "../domain/types";

export type ReadingSessionOrchestratorProps = {
  openedBook: OpenedBook;
  spl?: SecondPassClient | null;
  settings?: ReaderSettings;
  children: (arg: {
    state: ReadingSessionState;
    shell: ReactNode;
    debugPanel: ReactNode | null;
    sendCommand: (command: { type: "display"; target: ReaderLocationTarget } | { type: "next" } | { type: "previous" }) => void;
    annotations: {
      items: Array<ReaderBookmarkViewModel | { kind: "highlight"; id: string; cfiRange: string; text: string; label: string; descriptionStatus: "idle" | "loading" | "ready" | "error" }>;
      status: "idle" | "loading" | "ready" | "error";
      error: string | null;
      busy: boolean;
      toggleBookmarkAtCurrentLocation: () => Promise<void>;
      createHighlightFromSelection: () => Promise<void>;
      removeById: (annotationId: string) => Promise<void>;
    };
  }) => ReactNode;
};

// Placeholder orchestrator: will eventually own session state, SPL calls, and Shell cross-talk.
export function ReadingSessionOrchestrator(props: ReadingSessionOrchestratorProps) {
  const [location, setLocation] = useState<ReaderLocation | null>(null);
  const [toc, setToc] = useState<ReaderTocItem[] | null>(null);
  const [selection, setSelection] = useState<ReaderSelection | null>(null);
  const [pendingCommand, setPendingCommand] = useState<{ seq: number; value: { type: "display"; target: ReaderLocationTarget } | { type: "next" } | { type: "previous" } } | null>(null);
  const commandSeqRef = useRef(0);
  const profileVersion = props.openedBook.readingOpen?.profile_version ?? null;
  const [annotationsRaw, setAnnotationsRaw] = useState<ReadingAnnotation[]>([]);
  const [annotationStatus, setAnnotationStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [annotationError, setAnnotationError] = useState<string | null>(null);
  const [annotationBusy, setAnnotationBusy] = useState(false);
  const [describeCfi, setDescribeCfi] = useState<((cfi: string) => Promise<ReaderLocationDescription>) | null>(null);
  const [locationsReady, setLocationsReady] = useState(false);
  const [bookmarkDescriptions, setBookmarkDescriptions] = useState<
    Record<string, { status: "idle" | "loading" | "ready" | "error"; value?: ReaderLocationDescription }>
  >({});
  const bookmarkDescriptionsRef = useRef(bookmarkDescriptions);
  useEffect(() => {
    bookmarkDescriptionsRef.current = bookmarkDescriptions;
  }, [bookmarkDescriptions]);

  const handleDescribeCfiReady = useCallback(
    (fn: ((cfi: string) => Promise<ReaderLocationDescription>) | null) => {
      setDescribeCfi(() => fn);
      setLocationsReady(false);
    },
    [],
  );

  const initialDisplayTarget: ReaderLocationTarget | undefined = useMemo(() => {
    const progress = props.openedBook.readingOpen?.progress;
    const cfi =
      progress?.current_location?.cfi ??
      progress?.current_location?.selector?.value ??
      null;
    if (typeof cfi === "string" && cfi.trim()) return { type: "cfi", cfi: cfi.trim() };
    return undefined;
  }, [props.openedBook.readingOpen?.progress]);

  const state: ReadingSessionState = useMemo(() => {
    const seedAnnotations: ReaderAnnotation[] = annotationsRaw
      .map((a) => toReaderAnnotation(a))
      .filter((a): a is ReaderAnnotation => Boolean(a));
    return {
      bookId: props.openedBook.book.id,
      sessionId: props.openedBook.readingOpen?.session?.id ?? null,
      location,
      selection,
      toc,
      annotations: seedAnnotations,
    };
  }, [annotationsRaw, location, props.openedBook.book.id, props.openedBook.readingOpen?.session?.id, selection, toc]);

  const { autosave } = useReadingProgressAutosave({
    enabled: true,
    autosaveDelayMs: 5000,
    spl: props.spl,
    sessionId: state.sessionId,
    profileVersion,
    location: state.location,
  });

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const shouldTickAutosaveCountdown = Boolean(
    state.sessionId &&
      autosave.status !== "saving" &&
      autosave.status !== "saved" &&
      typeof autosave.nextSaveAt === "number" &&
      autosave.nextSaveAt > nowMs,
  );

  useEffect(() => {
    if (!shouldTickAutosaveCountdown) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [shouldTickAutosaveCountdown]);

  const autosaveStatus = useMemo((): { text: string; title?: string } | null => {
    if (!state.sessionId) return null;

    const lastSavedTitle =
      autosave.lastSavedAt && !Number.isNaN(Date.parse(autosave.lastSavedAt))
        ? `Last saved: ${new Date(autosave.lastSavedAt).toLocaleString()}`
        : undefined;

    switch (autosave.status) {
      case "saving":
        return { text: "Autosave: sending" };
      case "saved":
        return { text: "Autosave: complete", title: lastSavedTitle };
      case "pending":
      case "idle":
        if (typeof autosave.nextSaveAt === "number") {
          const remaining = Math.max(0, autosave.nextSaveAt - nowMs);
          const seconds = Math.max(0, Math.ceil(remaining / 1000));
          return { text: `Autosave: waiting (${seconds}s)` };
        }
        return { text: "Autosave: waiting" };
      case "error":
        // Keep UI terminology constrained; log details in console via hook/orchestrator.
        return { text: "Autosave: waiting" };
    }
  }, [autosave.lastSavedAt, autosave.nextSaveAt, autosave.status, nowMs, state.sessionId]);

  const statusLine = useMemo(() => {
    const parts: string[] = [];

    const chapterLabel = state.toc && state.location?.href ? findTocLabelForHref(state.toc, state.location.href) : null;
    if (chapterLabel) parts.push(chapterLabel);

    if (typeof state.location?.bookProgress === "number" && Number.isFinite(state.location.bookProgress)) {
      parts.push(`${Math.round(state.location.bookProgress * 100)}%`);
    }

    if (typeof state.location?.displayedPage === "number" && typeof state.location?.displayedTotal === "number") {
      parts.push(`p${state.location.displayedPage}/${state.location.displayedTotal}`);
    }

    return parts.join(" \u00B7 ");
  }, [state.location?.bookProgress, state.location?.displayedPage, state.location?.displayedTotal, state.location?.href, state.toc]);

  const onShellEvent = useCallback((event: ReadingShellEvent) => {
    switch (event.type) {
      case "locationChanged":
        setLocation(event.location);
        return;
      case "displayError":
        // Keep errors visible in the browser console; avoid a permanent reader debug panel in the UI.
        // eslint-disable-next-line no-console
        console.error("Reader error", event.error);
        return;
      case "selectionChanged":
        setSelection(event.selection ?? null);
        return;
      case "tocReady":
        setToc(event.toc);
        return;
      case "locationsReady":
        setLocationsReady(true);
        return;
    }
  }, []);

  const sendCommand = useCallback((command: { type: "display"; target: ReaderLocationTarget } | { type: "next" } | { type: "previous" }) => {
    commandSeqRef.current += 1;
    setPendingCommand({ seq: commandSeqRef.current, value: command });
  }, []);

  // Restore saved location via the same command path used for future navigation.
  // Best-effort: this command may be deferred by the shell until the engine exists.
  const lastRestoreKeyRef = useRef<string>("");
  useEffect(() => {
    if (!initialDisplayTarget) return;
    const key = `${props.openedBook.objectUrl}|${JSON.stringify(initialDisplayTarget)}`;
    if (lastRestoreKeyRef.current === key) return;
    lastRestoreKeyRef.current = key;
    sendCommand({ type: "display", target: initialDisplayTarget });
  }, [initialDisplayTarget, props.openedBook.objectUrl, sendCommand]);

  const sessionId = state.sessionId;

  const seedAnnotationsFromOpen = useCallback((annotations: ReadingAnnotation[] | null | undefined) => {
    const seeded: ReadingAnnotation[] = [];
    for (const a of annotations ?? []) seeded.push(a);
    if (seeded.length > 0) setAnnotationsRaw(seeded);
  }, []);

  // Seed from readingOpen response (first page) immediately when available.
  const lastSeedKeyRef = useRef<string>("");
  useEffect(() => {
    const open = props.openedBook.readingOpen;
    const id = open?.session?.id ?? "";
    if (!id) return;
    const key = `${props.openedBook.objectUrl}|${id}`;
    if (lastSeedKeyRef.current === key) return;
    lastSeedKeyRef.current = key;
    seedAnnotationsFromOpen(open?.annotations?.results as unknown as ReadingAnnotation[] | undefined);
  }, [props.openedBook.objectUrl, props.openedBook.readingOpen, seedAnnotationsFromOpen]);

  // Load bookmarks for the session (non-blocking).
  useEffect(() => {
    if (!props.spl) return;
    if (!sessionId) return;
    setAnnotationStatus("loading");
    setAnnotationError(null);

    let cancelled = false;
    void (async () => {
      try {
        const all: ReadingAnnotation[] = [];
        let page = 1;
        for (let guard = 0; guard < 50; guard += 1) {
          const res = await props.spl!.reading.annotations.list({
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
        setAnnotationsRaw(all);
        setAnnotationStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setAnnotationStatus("error");
        setAnnotationError(e instanceof Error ? e.message : "Failed to load annotations.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.spl, sessionId]);

  const bookmarks: ReaderBookmark[] = useMemo(() => {
    const out: ReaderBookmark[] = [];
    for (const a of annotationsRaw) {
      const b = toReaderBookmark(a);
      if (b) out.push(b);
    }
    return out;
  }, [annotationsRaw]);

  const currentBookmark = useMemo(() => {
    const cfi = location?.cfi?.trim() ?? "";
    if (!cfi) return null;
    // v1: exact CFI string match
    return bookmarks.find((b) => b.cfi === cfi) ?? null;
  }, [bookmarks, location?.cfi]);

  const highlights = useMemo(() => {
    const out: Array<{ id: string; cfiRange: string; text: string }> = [];
    for (const a of annotationsRaw) {
      if (!isHighlightAnnotation(a)) continue;
      const ra = toReaderAnnotation(a);
      if (ra?.kind !== "highlight") continue;
      out.push({ id: ra.id, cfiRange: ra.cfiRange, text: ra.text ?? "" });
    }
    return out;
  }, [annotationsRaw]);

  // Best-effort: describe bookmarks at runtime (no rendition jumps).
  // Important: avoid cancelling in-flight descriptions due to state updates.
  useEffect(() => {
    if (!describeCfi) return;
    if (bookmarks.length === 0 && highlights.length === 0) return;

    let cancelled = false;

    const current = bookmarkDescriptionsRef.current;
    const toDescribe = [...bookmarks.map((b) => b.cfi), ...highlights.map((h) => h.cfiRange)]
      .filter((cfi) => {
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
        if (
          existing?.status === "ready" &&
          !(locationsReady && existing.value && existing.value.bookProgress == null)
        ) {
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
      const entry = bookmarkDescriptions[b.cfi];
      return toBookmarkViewModel({
        bookmark: b,
        currentCfi: location?.cfi ?? null,
        toc,
        description: entry?.value ?? null,
        fallbackBookProgress: location?.bookProgress ?? null,
        descriptionStatus: entry?.status ?? (describeCfi ? "idle" : "idle"),
      });
    });
  }, [bookmarkDescriptions, bookmarks, describeCfi, location?.bookProgress, location?.cfi, toc]);

  const highlightViewModels = useMemo(() => {
    return highlights.map((h) => {
      const raw = annotationsRaw.find((a) => a.id === h.id) ?? null;
      const note = raw ? getAnnotationNoteText(raw) : null;
      const color = raw ? getAnnotationColor(raw) : null;
      const timestamp = raw ? getAnnotationTimestamp(raw) : null;
      const entry = bookmarkDescriptions[h.cfiRange];
      const href = entry?.value?.href ?? undefined;
      const chapterLabel = href && toc ? findTocLabelForHref(toc, href) : null;
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
  }, [annotationsRaw, bookmarkDescriptions, highlights, toc]);

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

  const removeById = useCallback(
    async (annotationId: string) => {
      if (!props.spl) return;
      if (!annotationId) return;
      setAnnotationBusy(true);
      setAnnotationError(null);
      try {
        await props.spl.reading.annotations.remove(annotationId);
        setAnnotationsRaw((prev) => prev.filter((a) => a.id !== annotationId));
      } catch (e) {
        setAnnotationError(e instanceof Error ? e.message : "Failed to remove annotation.");
      } finally {
        setAnnotationBusy(false);
      }
    },
    [props.spl],
  );

  const toggleBookmarkAtCurrentLocation = useCallback(async () => {
    if (!props.spl) return;
    if (!sessionId) return;
    if (!profileVersion) return;
    const cfi = location?.cfi?.trim() ?? "";
    if (!cfi) return;

    if (currentBookmark) {
      await removeById(currentBookmark.id);
      return;
    }

    setAnnotationBusy(true);
    setAnnotationError(null);
    try {
      const created = await props.spl.reading.annotations.createBookmark({
        sessionId,
        profileVersion,
        cfi,
      });
      const b = toReaderBookmark(created as unknown as ReadingAnnotation);
      if (b) {
        setAnnotationsRaw((prev) => [...prev.filter((x) => x.id !== b.id), created as unknown as ReadingAnnotation]);
      }
    } catch (e) {
      setAnnotationError(e instanceof Error ? e.message : "Failed to create bookmark.");
    } finally {
      setAnnotationBusy(false);
    }
  }, [currentBookmark, location?.cfi, profileVersion, props.spl, removeById, sessionId]);

  const createHighlightFromSelection = useCallback(async () => {
    if (!props.spl) return;
    if (!sessionId) return;
    if (!profileVersion) return;
    const sel = selection;
    if (!sel?.cfiRange || !sel.text) return;

    setAnnotationBusy(true);
    setAnnotationError(null);
    try {
      const created = await props.spl.reading.annotations.createHighlight({
        sessionId,
        profileVersion,
        cfiRange: sel.cfiRange,
        text: sel.text,
        quotePrefix: sel.quotePrefix,
        quoteSuffix: sel.quoteSuffix,
      });
      setAnnotationsRaw((prev) => [...prev.filter((x) => x.id !== created.id), created as unknown as ReadingAnnotation]);
      setSelection(null);
    } catch (e) {
      setAnnotationError(e instanceof Error ? e.message : "Failed to create highlight.");
    } finally {
      setAnnotationBusy(false);
    }
  }, [profileVersion, props.spl, selection, sessionId]);

  return props.children({
    state,
    shell: (
      <ReadingShell
        blob={props.openedBook.blob}
        initialDisplayTarget={initialDisplayTarget}
        annotations={state.annotations}
        onEvent={onShellEvent}
        command={pendingCommand ?? undefined}
        statusLine={statusLine}
        autosaveStatus={autosaveStatus}
        onDescribeCfiReady={handleDescribeCfiReady}
        selection={selection}
        highlightMarks={highlightMarks}
        selectionActions={{
          enabled: Boolean(sessionId && profileVersion && selection?.cfiRange && selection?.text),
          busy: annotationBusy,
          onHighlight: () => {
            void createHighlightFromSelection();
          },
          onCancel: () => {
            setSelection(null);
          },
        }}
        bookmark={{
          enabled: Boolean(sessionId && profileVersion && location?.cfi),
          isBookmarked: Boolean(currentBookmark),
          busy: annotationBusy,
          onToggle: () => {
            void toggleBookmarkAtCurrentLocation();
          },
        }}
      />
    ),
    debugPanel: null,
    sendCommand,
    annotations: {
      items: [...bookmarkViewModels, ...highlightViewModels],
      status: annotationStatus,
      error: annotationError,
      busy: annotationBusy,
      toggleBookmarkAtCurrentLocation,
      createHighlightFromSelection,
      removeById,
    },
  });
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
