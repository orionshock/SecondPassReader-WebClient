import { useCallback, useMemo, useState } from "react";
import "./handlers/registerBuiltInReaderImportHandlers";
import { getReaderImportFormat } from "./readerImportFormats";
import { resetOtherStagedRowsForActivation } from "./readerImportJobState";
import type { ReaderImportFormat, ReaderImportJob, ReaderImportRowStatus } from "./readerImportTypes";

export function useReaderImportJob() {
  const [job, setJob] = useState<ReaderImportJob | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const startImport = useCallback(async (format: ReaderImportFormat, file: File) => {
    const nextJob = await getReaderImportFormat(format).importFile(file);
    setJob(nextJob);
    setDrawerOpen(true);
    return nextJob;
  }, []);

  const startGlaspCsvImport = useCallback((file: File) => startImport("glasp-csv", file), [startImport]);

  const setRowStatus = useCallback((rowId: string, status: ReaderImportRowStatus) => {
    setJob((prev) => prev ? { ...prev, rows: prev.rows.map((row) => row.id === rowId ? { ...row, status } : row) } : prev);
  }, []);

  const setSourcedRowStatus = useCallback((jobId: string, rowId: string, status: ReaderImportRowStatus) => {
    setJob((prev) => {
      if (!prev || prev.id !== jobId) return prev;
      return { ...prev, rows: prev.rows.map((row) => row.id === rowId ? { ...row, status } : row) };
    });
  }, []);

  const selectRow = useCallback((rowId: string) => {
    setJob((prev) => prev ? { ...prev, activeRowId: rowId, rows: resetOtherStagedRowsForActivation(prev.rows, rowId) } : prev);
  }, []);

  const clearJob = useCallback(() => {
    setJob(null);
    setDrawerOpen(false);
  }, []);

  const counts = useMemo(() => {
    const out = { pending: 0, accepted: 0, skipped: 0, notFound: 0 };
    for (const row of job?.rows ?? []) {
      if (row.status === "accepted") out.accepted += 1;
      else if (row.status === "skipped") out.skipped += 1;
      else if (row.status === "not-found") out.notFound += 1;
      else out.pending += 1;
    }
    return out;
  }, [job?.rows]);

  return {
    job,
    drawerOpen,
    setDrawerOpen,
    counts,
    startImport,
    startGlaspCsvImport,
    clearJob,
    selectRow,
    setRowStatus,
    markRowAccepted: (jobId: string, rowId: string) => setSourcedRowStatus(jobId, rowId, "accepted"),
    markRowPending: (jobId: string, rowId: string) => setSourcedRowStatus(jobId, rowId, "pending"),
    skipRow: (rowId: string) => setRowStatus(rowId, "skipped"),
    unskipRow: (rowId: string) => setRowStatus(rowId, "pending"),
  };
}
