import { useCallback, useMemo, useRef, useState } from "react";
import { getReaderImportFormat } from "./ReaderImportFormats.Registry";
import { acceptSuggestedBookmarkRow, getReaderImportJobCounts, type ReaderImportBookmarkSuggestion, resetOtherStagedRowsForActivation, resetStagedRowsForNavigation, setReaderImportRowStatus, undoReaderImportManualCompletion } from "./ReaderImportJob.State";
import type { ReaderImportJob, ReaderImportRow, ReaderImportRowStatus } from "./ReaderImport.Types";
import { ReaderImportReviewLifetime } from "./ReaderImportReview.Lifecycle";

export function useReaderImportJob() {
  const [job, setJob] = useState<ReaderImportJob | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bookmarkSuggestion, setBookmarkSuggestion] = useState<ReaderImportBookmarkSuggestion | null>(null);
  const reviewLifetimeRef = useRef<ReaderImportReviewLifetime | null>(null);
  if (!reviewLifetimeRef.current) reviewLifetimeRef.current = new ReaderImportReviewLifetime();
  const reviewLifetime = reviewLifetimeRef.current;

  const startImport = useCallback(async (format: string, file: File) => {
    const ownsReplacement = reviewLifetime.beginJobReplacement();
    await import("./handlers/ReaderImportHandlers.Lifecycle");
    const nextJob = await getReaderImportFormat(format).importFile(file);
    if (!ownsReplacement()) return nextJob;
    setJob(nextJob);
    setBookmarkSuggestion(null);
    setDrawerOpen(true);
    return nextJob;
  }, [reviewLifetime]);

  const startGlaspCsvImport = useCallback((file: File) => startImport("glasp-csv", file), [startImport]);

  const setRowStatus = useCallback((rowId: string, status: ReaderImportRowStatus) => {
    setJob((prev) => prev ? { ...prev, rows: prev.rows.map((row) => row.id === rowId ? setReaderImportRowStatus(row, status) : row) } : prev);
  }, []);

  const setRowActivationState = useCallback((rowId: string, status: ReaderImportRowStatus, cycle?: Pick<ReaderImportRow, "attemptCursor" | "resultCursor" | "hasMatched" | "candidateIndex" | "candidateCount">) => {
    setJob((prev) => prev ? {
      ...prev,
      rows: prev.rows.map((row) => row.id === rowId ? setReaderImportRowStatus(row, status, cycle) : row),
    } : prev);
  }, []);

  const setSourcedRowStatus = useCallback((jobId: string, rowId: string, status: ReaderImportRowStatus) => {
    reviewLifetime.invalidateJob(jobId);
    setJob((prev) => {
      if (!prev || prev.id !== jobId) return prev;
      return { ...prev, rows: prev.rows.map((row) => row.id === rowId ? setReaderImportRowStatus(row, status) : row) };
    });
  }, [reviewLifetime]);

  const selectRow = useCallback((rowId: string) => {
    setBookmarkSuggestion(null);
    setJob((prev) => prev ? { ...prev, activeRowId: rowId, rows: resetOtherStagedRowsForActivation(prev.rows, rowId) } : prev);
  }, []);

  const clearJob = useCallback(() => {
    reviewLifetime.invalidate();
    setBookmarkSuggestion(null);
    setJob(null);
    setDrawerOpen(false);
  }, [reviewLifetime]);

  const cancelStagedRowsForNavigation = useCallback(() => {
    reviewLifetime.invalidate();
    setBookmarkSuggestion(null);
    setJob((prev) => prev ? { ...prev, rows: resetStagedRowsForNavigation(prev.rows) } : prev);
  }, [reviewLifetime]);

  const setImportDrawerOpen = useCallback((open: boolean) => {
    if (!open) {
      reviewLifetime.invalidate();
      setBookmarkSuggestion(null);
    }
    setDrawerOpen(open);
  }, [reviewLifetime]);

  const suggestBookmark = useCallback((suggestion: ReaderImportBookmarkSuggestion) => {
    setBookmarkSuggestion(suggestion);
  }, []);

  const acceptBookmarkSuggestion = useCallback((suggestion: ReaderImportBookmarkSuggestion) => {
    reviewLifetime.invalidateJob(suggestion.jobId);
    setJob((prev) => {
      if (!prev || prev.id !== suggestion.jobId) return prev;
      return { ...prev, rows: acceptSuggestedBookmarkRow(prev.rows, suggestion) };
    });
    setBookmarkSuggestion((current) => current?.jobId === suggestion.jobId
      && current.rowId === suggestion.rowId
      && current.cfi === suggestion.cfi
      ? null
      : current);
  }, [reviewLifetime]);

  const skipRow = useCallback((rowId: string) => {
    reviewLifetime.invalidate();
    setBookmarkSuggestion((suggestion) => suggestion?.rowId === rowId ? null : suggestion);
    setRowStatus(rowId, "skipped");
  }, [reviewLifetime, setRowStatus]);

  const markRowManuallyCompleted = useCallback((rowId: string) => {
    reviewLifetime.invalidate();
    setBookmarkSuggestion((suggestion) => suggestion?.rowId === rowId ? null : suggestion);
    setRowStatus(rowId, "manually-completed");
  }, [reviewLifetime, setRowStatus]);

  const undoManualCompletion = useCallback((rowId: string) => {
    setJob((prev) => prev ? {
      ...prev,
      rows: prev.rows.map((row) => row.id === rowId ? undoReaderImportManualCompletion(row) : row),
    } : prev);
  }, []);

  const counts = useMemo(() => getReaderImportJobCounts(job?.rows ?? []), [job?.rows]);

  return {
    job,
    drawerOpen,
    setDrawerOpen: setImportDrawerOpen,
    bookmarkSuggestion,
    reviewLifetime,
    suggestBookmark,
    acceptBookmarkSuggestion,
    counts,
    startImport,
    startGlaspCsvImport,
    clearJob,
    cancelStagedRowsForNavigation,
    selectRow,
    setRowStatus,
    setRowActivationState,
    markRowAccepted: (jobId: string, rowId: string) => setSourcedRowStatus(jobId, rowId, "accepted"),
    markRowPending: (jobId: string, rowId: string) => setSourcedRowStatus(jobId, rowId, "pending"),
    skipRow,
    markRowManuallyCompleted,
    undoManualCompletion,
    unskipRow: (rowId: string) => setRowStatus(rowId, "pending"),
  };
}
