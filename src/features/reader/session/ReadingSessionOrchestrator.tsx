import type { ReaderSettings } from "../../../storage/readerSettings";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ReadingShell } from "../shell/ReadingShell";
import type { ReadingShellEvent } from "../shell/types";
import type { ReaderAnnotation, ReaderHighlightMark, ReaderLocation, ReaderLocationTarget, ReaderSelection } from "../domain/types";
import type { ReaderTocItem } from "../domain/types";
import type { ReadingSessionState } from "./types";
import type { OpenedBook } from "../types";
import { useReadingProgressAutosave } from "./useReadingProgressAutosave";
import type { SecondPassClient } from "@secondpass/client";
import type { ReadingAnnotation } from "@secondpass/client";
import { toReaderBookmark, type ReaderBookmarkViewModel } from "../annotations/bookmarkUtils";
import type { HighlightViewModel } from "../annotations/viewModels";
import { getAnnotationColor, getAnnotationDescribingText, toReaderAnnotation } from "../annotations/annotationUtils";
import { useSessionAnnotations } from "./useSessionAnnotations";
import { usePreviousSessionLayers, type PreviousSessionAnnotationGroup } from "./usePreviousSessionLayers";

export type ReadingSessionOrchestratorProps = {
  openedBook: OpenedBook;
  spl?: SecondPassClient | null;
  settings?: ReaderSettings;
  onSettingsChange?: (patch: Partial<ReaderSettings>) => void;
  onSettingsReset?: () => void;
  children: (arg: {
    state: ReadingSessionState;
    statusLine: string[];
    autosaveStatus: { text: string; title?: string } | null;
    shell: ReactNode;
    debugPanel: ReactNode | null;
    sendCommand: (command: { type: "display"; target: ReaderLocationTarget } | { type: "next" } | { type: "previous" }) => void;
    marginalia: {
      listStatus: "idle" | "loading" | "ready" | "error";
      listError: string | null;
      previousLayers: Array<{ sessionId: string; label: string; labelParts: string[]; highlightCount: number; status: "idle" | "loading" | "ready" | "error"; error?: string }>;
      selectedPreviousSessionIds: string[];
      togglePreviousSession: (sessionId: string) => void;
    };
    annotations: {
      items: Array<ReaderBookmarkViewModel | HighlightViewModel>;
      status: "idle" | "loading" | "ready" | "error";
      error: string | null;
      busy: boolean;
      toggleBookmarkAtCurrentLocation: () => Promise<void>;
      createHighlight: (input: { selection: ReaderSelection; color: string; note?: string }) => Promise<void>;
      removeById: (annotationId: string) => Promise<void>;
      updateHighlight: (annotationId: string, update: { note: string; color: string }) => Promise<void>;
      previousSessionGroups: PreviousSessionAnnotationGroup[];
      enablePreviousSession: (sessionId: string) => void;
      currentSessionMeta: { name: string | null; notes: string | null; status: "idle" | "loading" | "ready" | "error"; error: string | null };
      updateCurrentSessionMeta: (update: { name: string; notes: string }) => Promise<void>;
      closeCurrentSession: (input: { name: string; notes: string }) => Promise<void>;
    };
  }) => ReactNode;
};

// Placeholder orchestrator: will eventually own session state, SPL calls, and Shell cross-talk.
export function ReadingSessionOrchestrator(props: ReadingSessionOrchestratorProps) {
  const [location, setLocation] = useState<ReaderLocation | null>(null);
  const [toc, setToc] = useState<ReaderTocItem[] | null>(null);
  const [pendingCommand, setPendingCommand] = useState<{ seq: number; value: { type: "display"; target: ReaderLocationTarget } | { type: "next" } | { type: "previous" } } | null>(null);
  const commandSeqRef = useRef(0);
  const profileVersion = props.openedBook.readingOpen?.profile_version ?? null;
  const [annotationBusy, setAnnotationBusy] = useState(false);
  const sessionId = props.openedBook.readingOpen?.session?.id ?? null;

  const [currentSessionMeta, setCurrentSessionMeta] = useState<{
    name: string | null;
    notes: string | null;
    status: "idle" | "loading" | "ready" | "error";
    error: string | null;
  }>({ name: null, notes: null, status: "idle", error: null });

  useEffect(() => {
    if (!props.spl) return;
    if (!sessionId) return;
    setCurrentSessionMeta((prev) => ({ ...prev, status: "loading", error: null }));
    let cancelled = false;
    void (async () => {
      try {
        const s = await props.spl!.reading.sessions.get(sessionId);
        if (cancelled) return;
        const name = typeof (s as any).name === "string" ? (s as any).name : null;
        const notes = typeof (s as any).notes === "string" ? (s as any).notes : null;
        setCurrentSessionMeta({ name, notes, status: "ready", error: null });
      } catch (e) {
        if (cancelled) return;
        setCurrentSessionMeta((prev) => ({ ...prev, status: "error", error: e instanceof Error ? e.message : "Failed to load session details." }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.spl, sessionId]);

  const updateCurrentSessionMeta = useCallback(
    async (update: { name: string; notes: string }) => {
      if (!props.spl) throw new Error("Not connected.");
      if (!sessionId) throw new Error("Missing session id.");
      const name = update.name.trim();
      const notes = update.notes.trim();
      const updated = await props.spl.reading.sessions.updateDetails(sessionId, {
        name: name ? name : "",
        notes: notes ? notes : "",
      });
      const nextName = typeof (updated as any).name === "string" ? (updated as any).name : (name ? name : "");
      const nextNotes = typeof (updated as any).notes === "string" ? (updated as any).notes : (notes ? notes : "");
      setCurrentSessionMeta({ name: nextName || null, notes: nextNotes || null, status: "ready", error: null });
    },
    [props.spl, sessionId],
  );

  const closeCurrentSession = useCallback(
    async (input: { name: string; notes: string }) => {
      if (!props.spl) throw new Error("Not connected.");
      if (!sessionId) throw new Error("Missing session id.");

      const savedName = currentSessionMeta.name?.trim() ?? "";
      const savedNotes = currentSessionMeta.notes ?? "";
      const payload: { name?: string; notes?: string } = {};
      if (input.name !== savedName) payload.name = input.name;
      if (input.notes !== savedNotes) payload.notes = input.notes;
      if (Object.keys(payload).length > 0) {
        await props.spl.reading.sessions.updateDetails(sessionId, payload);
      }
      await props.spl.reading.sessions.close(sessionId);
      setCurrentSessionMeta((prev) => ({ ...prev, name: input.name || null, notes: input.notes || null }));
    },
    [currentSessionMeta.name, currentSessionMeta.notes, props.spl, sessionId],
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

  const sessionAnnotations = useSessionAnnotations({
    openedBook: props.openedBook,
    spl: props.spl,
    sessionId,
    location,
    toc,
  });
  const {
    raw: annotationsRaw,
    setRaw: setAnnotationsRaw,
    status: annotationStatus,
    error: annotationError,
    setError: setAnnotationError,
    items: annotationItems,
    highlightMarks,
    handleDescribeCfiReady,
    onLocationsReady,
    currentBookmark,
  } = sessionAnnotations;

  const previousLayers = usePreviousSessionLayers({
    spl: props.spl,
    bookId: props.openedBook.book.id,
    currentSessionId: sessionId,
  });

  const state: ReadingSessionState = useMemo(() => {
    const seedAnnotations: ReaderAnnotation[] = annotationsRaw
      .map((a) => toReaderAnnotation(a))
      .filter((a): a is ReaderAnnotation => Boolean(a));
    return {
      bookId: props.openedBook.book.id,
      sessionId,
      location,
      toc,
      annotations: seedAnnotations,
    };
  }, [annotationsRaw, location, props.openedBook.book.id, sessionId, toc]);

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

    return parts;
  }, [state.location?.bookProgress, state.location?.displayedPage, state.location?.displayedTotal, state.location?.href, state.toc]);

  const visibleHighlightMarks: ReaderHighlightMark[] = useMemo(() => {
    const out: ReaderHighlightMark[] = [...highlightMarks, ...previousLayers.selectedHighlightMarks];
    // Preserve existing behavior: staged selection mark composes in the shell; durable marks are filtered here only.
    return out;
  }, [highlightMarks, previousLayers.selectedHighlightMarks]);

  const sendCommand = useCallback((command: { type: "display"; target: ReaderLocationTarget } | { type: "next" } | { type: "previous" }) => {
    commandSeqRef.current += 1;
    setPendingCommand({ seq: commandSeqRef.current, value: command });
  }, []);

  // Keep this callback referentially stable: `ReadingShell`'s engine init effect depends on `onEvent`.
  // Unstable callbacks here can cause destroy/re-init loops (duplicated network requests, blank viewport).
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
      case "tocReady":
        setToc(event.toc);
        return;
      case "locationsReady":
        onLocationsReady();
        return;
      case "navigate":
        sendCommand({ type: "display", target: event.target });
        return;
    }
  }, [onLocationsReady, sendCommand]);

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
    [props.spl, setAnnotationError, setAnnotationsRaw],
  );

  const updateHighlight = useCallback(
    async (annotationId: string, update: { note: string; color: string }) => {
      if (!props.spl) throw new Error("Not connected.");
      if (!annotationId) return;
      if (!profileVersion) throw new Error("Missing profile version.");

      const raw = annotationsRaw.find((a) => a.id === annotationId) ?? null;
      if (!raw) throw new Error("Annotation not found.");

      const text = getAnnotationDescribingText(raw) ?? "";
      if (!text.trim()) throw new Error("Cannot edit highlight without describing text.");

      const nextColor = update.color.trim() || (getAnnotationColor(raw) ?? "").trim() || "yellow";

      const nextNote = update.note.trim();

      setAnnotationBusy(true);
      setAnnotationError(null);
      try {
        const updated = await props.spl.reading.annotations.updateNote(annotationId, {
          profileVersion,
          text,
          color: nextColor,
          note: nextNote ? nextNote : null,
        });
        setAnnotationsRaw((prev) => [...prev.filter((a) => a.id !== annotationId), updated as unknown as ReadingAnnotation]);
      } catch (e) {
        setAnnotationError(e instanceof Error ? e.message : "Failed to update highlight.");
        throw e;
      } finally {
        setAnnotationBusy(false);
      }
    },
    [annotationsRaw, profileVersion, props.spl, setAnnotationError, setAnnotationsRaw],
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
  }, [currentBookmark, location?.cfi, profileVersion, props.spl, removeById, sessionId, setAnnotationError, setAnnotationsRaw]);

  const createHighlight = useCallback(
    async (input: { selection: ReaderSelection; color: string; note?: string }) => {
      if (!props.spl) throw new Error("Not connected.");
      if (!sessionId) throw new Error("Missing session.");
      if (!profileVersion) throw new Error("Missing profile version.");
      const sel = input.selection;
      if (!sel?.cfiRange || !sel.text) throw new Error("Missing selection.");

      setAnnotationBusy(true);
      setAnnotationError(null);
      try {
        const created = await props.spl.reading.annotations.createHighlight({
          sessionId,
          profileVersion,
          cfiRange: sel.cfiRange,
          text: sel.text,
          color: input.color,
          note: input.note,
          quotePrefix: sel.quotePrefix,
          quoteSuffix: sel.quoteSuffix,
        });
        setAnnotationsRaw((prev) => [...prev.filter((x) => x.id !== created.id), created as unknown as ReadingAnnotation]);
      } catch (e) {
        setAnnotationError(e instanceof Error ? e.message : "Failed to create highlight.");
        throw e;
      } finally {
        setAnnotationBusy(false);
      }
    },
    [profileVersion, props.spl, sessionId, setAnnotationError, setAnnotationsRaw],
  );

  return props.children({
    state,
    statusLine,
    autosaveStatus,
    shell: (
      <ReadingShell
        blob={props.openedBook.blob}
        initialDisplayTarget={initialDisplayTarget}
        onEvent={onShellEvent}
        command={pendingCommand ?? undefined}
        toc={toc}
        onDescribeCfiReady={handleDescribeCfiReady}
        highlightMarks={visibleHighlightMarks}
        onCommitHighlight={async (arg) => createHighlight(arg)}
        highlightCommitBusy={annotationBusy}
        settings={props.settings}
        onSettingsChange={props.onSettingsChange}
        onSettingsReset={props.onSettingsReset}
      />
    ),
    debugPanel: null,
    sendCommand,
    marginalia: {
      listStatus: previousLayers.listStatus,
      listError: previousLayers.listError,
      previousLayers: previousLayers.previousLayers,
      selectedPreviousSessionIds: previousLayers.selectedPreviousSessionIds,
      togglePreviousSession: previousLayers.togglePreviousSession,
    },
    annotations: {
      items: annotationItems,
      status: annotationStatus,
      error: annotationError,
      busy: annotationBusy,
      toggleBookmarkAtCurrentLocation,
      createHighlight,
      removeById,
      updateHighlight,
      previousSessionGroups: previousLayers.previousAnnotationGroups,
      enablePreviousSession: previousLayers.togglePreviousSession,
      currentSessionMeta,
      updateCurrentSessionMeta,
      closeCurrentSession,
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
