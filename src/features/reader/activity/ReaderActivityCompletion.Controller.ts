import type { CompactBook, SecondPassClient } from "@secondpass/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { navigateTo } from "../../../app/navigation";
import type { CloseSessionAfterOption, CloseSessionInput } from "../../sessions/CloseSessionDialog";
import { findNextSeriesBook, normalizeSeriesIndex } from "../../library/seriesUtils";
import { buildReturnLabel, saveReaderReturnTarget } from "../ReaderReturnTarget.Store";
import type { OpenedBook } from "../Reader.Types";
import type { ReaderActivityRenderState } from "./readerActivityTypes";

const READER_FINISH_PROGRESS_THRESHOLD = 0.95;

export function useReaderActivityCompletionController({
  openedBook,
  spl,
  state,
  closeCurrentSession,
}: {
  openedBook: OpenedBook;
  spl?: SecondPassClient | null;
  state: ReaderActivityRenderState["state"];
  closeCurrentSession: ReaderActivityRenderState["annotations"]["closeCurrentSession"];
}) {
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [endBookDialogOpen, setEndBookDialogOpen] = useState(false);
  const [nextSeriesBook, setNextSeriesBook] = useState<CompactBook | null>(null);
  const [nextSeriesStatus, setNextSeriesStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const shownEndBookSessionIdsRef = useRef<Set<string>>(new Set());
  const currentSessionId = state.sessionId;
  const progress = state.location?.bookProgress;
  const nearEnd = typeof progress === "number" && Number.isFinite(progress) && progress >= READER_FINISH_PROGRESS_THRESHOLD;
  const showFinishControls = Boolean(currentSessionId && nearEnd);
  const activeReaderKey = `${openedBook.book.id}|${currentSessionId ?? ""}`;
  const seriesId = openedBook.book.series?.id;
  const currentSeriesIndex = normalizeSeriesIndex(openedBook.book.series?.seriesIndex);
  const canLookupNextBook = seriesId != null && currentSeriesIndex != null;
  const returnTarget = openedBook.returnTarget;
  const returnLabel = buildReturnLabel(returnTarget);
  const showHomeAction = returnTarget.kind !== "home";

  useEffect(() => {
    setEndBookDialogOpen(false);
    setCloseDialogOpen(false);
    setNextSeriesBook(null);
    setNextSeriesStatus("idle");
  }, [activeReaderKey]);

  useEffect(() => {
    if (!currentSessionId || !state.location || !nearEnd || endBookDialogOpen || closeDialogOpen) return;
    if (shownEndBookSessionIdsRef.current.has(currentSessionId)) return;
    shownEndBookSessionIdsRef.current.add(currentSessionId);
    setEndBookDialogOpen(true);
  }, [closeDialogOpen, currentSessionId, endBookDialogOpen, nearEnd, state.location]);

  useEffect(() => {
    if (!showFinishControls || !spl || !canLookupNextBook) {
      setNextSeriesBook(null);
      setNextSeriesStatus("idle");
      return;
    }

    let cancelled = false;
    setNextSeriesBook(null);
    setNextSeriesStatus("loading");
    void (async () => {
      try {
        const books = await spl.library.books.list({ series: String(seriesId), ordering: "series_index", pageSize: 100 });
        if (cancelled) return;
        setNextSeriesBook(findNextSeriesBook(openedBook.book, books.results));
        setNextSeriesStatus("ready");
      } catch {
        if (!cancelled) {
          setNextSeriesBook(null);
          setNextSeriesStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canLookupNextBook, openedBook.book, seriesId, showFinishControls, spl]);

  const closeSession = useCallback(async (input: CloseSessionInput) => {
    if (!currentSessionId) throw new Error("Missing session id.");
    await closeCurrentSession({ name: input.name, notes: input.notes });
    setCloseDialogOpen(false);
    if (input.afterAction === "nextBook" && nextSeriesBook) {
      saveReaderReturnTarget(nextSeriesBook.id, returnTarget);
      navigateTo({ kind: "reader", bookId: String(nextSeriesBook.id) });
    } else if (input.afterAction === "restartBook") {
      saveReaderReturnTarget(openedBook.book.id, returnTarget);
      navigateTo({ kind: "reader", bookId: String(openedBook.book.id) }, { replace: true });
      window.location.reload();
    } else if (input.afterAction === "home") {
      window.location.hash = returnTarget.route;
    } else if (input.afterAction === "sessions") {
      navigateTo({ kind: "sessions" });
    } else {
      navigateTo({ kind: "session", sessionId: currentSessionId });
    }
  }, [closeCurrentSession, currentSessionId, nextSeriesBook, openedBook.book.id, returnTarget]);

  const startNextBook = useCallback((book: CompactBook) => {
    setEndBookDialogOpen(false);
    setCloseDialogOpen(false);
    saveReaderReturnTarget(book.id, returnTarget);
    navigateTo({ kind: "reader", bookId: String(book.id) });
  }, [returnTarget]);

  const finishCurrentSession = useCallback(() => {
    setEndBookDialogOpen(false);
    setCloseDialogOpen(true);
  }, []);

  const openEndBookDialog = useCallback(() => setEndBookDialogOpen(true), []);
  const keepReading = useCallback(() => setEndBookDialogOpen(false), []);
  const openCloseDialog = useCallback(() => setCloseDialogOpen(true), []);
  const cancelCloseSession = useCallback(() => setCloseDialogOpen(false), []);
  const returnToTarget = useCallback(() => {
    window.location.hash = returnTarget.route;
  }, [returnTarget.route]);

  const closeAfterOptions = useMemo<CloseSessionAfterOption[]>(() => [
    ...(nextSeriesBook ? [{ action: "nextBook" as const, label: "Start next book" }] : []),
    { action: "restartBook", label: "Start this book again" },
    { action: "home", label: returnLabel },
    { action: "detail", label: "View closed session" },
    { action: "sessions", label: "Go to sessions" },
  ], [nextSeriesBook, returnLabel]);

  return useMemo(() => ({
    showFinishControls,
    headerEndLabel: nextSeriesBook ? "Next book..." : "End options...",
    nextBookAvailable: Boolean(nextSeriesBook),
    openEndBookDialog,
    openCloseDialog,
    returnLabel,
    returnToTarget,
    showHomeAction,
    closeDialogOpen,
    closeAfterOptions,
    defaultAfterAction: nextSeriesBook ? "nextBook" as const : "home" as const,
    nextSeriesBook,
    cancelCloseSession,
    closeSession,
    endBookDialogOpen,
    nextSeriesStatus,
    canLookupNextBook,
    startNextBook,
    finishCurrentSession,
    keepReading,
    goToReturnTarget: nextSeriesBook ? undefined : returnToTarget,
  }), [canLookupNextBook, cancelCloseSession, closeAfterOptions, closeDialogOpen, closeSession, endBookDialogOpen, finishCurrentSession, keepReading, nextSeriesBook, nextSeriesStatus, openCloseDialog, openEndBookDialog, returnLabel, returnToTarget, showFinishControls, showHomeAction, startNextBook]);
}
