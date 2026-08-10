import { useCallback, useMemo, useState } from "react";
import { getReaderImportFormat } from "./ReaderImportFormats.Registry";
import { acceptSuggestedBookmarkRow, getReaderImportJobCounts, type ReaderImportBookmarkSuggestion, resetOtherStagedRowsForActivation, resetStagedRowsForNavigation, setReaderImportRowStatus, undoReaderImportManualCompletion } from "./ReaderImportJob.State";
import type { ReaderImportJob, ReaderImportRow, ReaderImportRowStatus } from "./ReaderImport.Types";

export function useReaderImportJob() {
  const [job, setJob] = useState<ReaderImportJob | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bookmarkSuggestion, setBookmarkSuggestion] = useState<ReaderImportBookmarkSuggestion | null>(null);

  const startImport = useCallback(async (format: string, file: File) => {
    await import("./handlers/ReaderImportHandlers.Lifecycle");
    const nextJob = await getReaderImportFormat(format).importFile(file);
    setJob(nextJob);
    setBookmarkSuggestion(null);
    setDrawerOpen(true);
    return nextJob;
  }, []);

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
    setJob((prev) => {
      if (!prev || prev.id !== jobId) return prev;
      return { ...prev, rows: prev.rows.map((row) => row.id === rowId ? setReaderImportRowStatus(row, status) : row) };
    });
  }, []);

  const selectRow = useCallback((rowId: string) => {
    setBookmarkSuggestion(null);
    setJob((prev) => prev ? { ...prev, activeRowId: rowId, rows: resetOtherStagedRowsForActivation(prev.rows, rowId) } : prev);
  }, []);

  const clearJob = useCallback(() => {
    setBookmarkSuggestion(null);
    setJob(null);
    setDrawerOpen(false);
  }, []);

  const cancelStagedRowsForNavigation = useCallback(() => {
    setBookmarkSuggestion(null);
    setJob((prev) => prev ? { ...prev, rows: resetStagedRowsForNavigation(prev.rows) } : prev);
  }, []);

  const setImportDrawerOpen = useCallback((open: boolean) => {
    if (!open) setBookmarkSuggestion(null);
    setDrawerOpen(open);
  }, []);

  const suggestBookmark = useCallback((suggestion: ReaderImportBookmarkSuggestion) => {
    setBookmarkSuggestion(suggestion);
  }, []);

  const acceptBookmarkSuggestion = useCallback((currentCfi: string) => {
    if (!bookmarkSuggestion || bookmarkSuggestion.cfi !== currentCfi.trim()) return;
    setJob((prev) => {
      if (!prev || prev.id !== bookmarkSuggestion.jobId) return prev;
      return { ...prev, rows: acceptSuggestedBookmarkRow(prev.rows, bookmarkSuggestion) };
    });
    setBookmarkSuggestion(null);
  }, [bookmarkSuggestion]);

  const skipRow = useCallback((rowId: string) => {
    setBookmarkSuggestion((suggestion) => suggestion?.rowId === rowId ? null : suggestion);
    setRowStatus(rowId, "skipped");
  }, [setRowStatus]);

  const markRowManuallyCompleted = useCallback((rowId: string) => {
    setBookmarkSuggestion((suggestion) => suggestion?.rowId === rowId ? null : suggestion);
    setRowStatus(rowId, "manually-completed");
  }, [setRowStatus]);

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
