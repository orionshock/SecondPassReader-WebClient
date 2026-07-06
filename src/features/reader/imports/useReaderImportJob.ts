import { useCallback, useMemo, useState } from "react";
import { parseGlaspCsv } from "./glaspCsvParser";
import type { ReaderImportJob, ReaderImportRowStatus } from "./readerImportTypes";
import { parseSplMarginaliaSessionImport } from "./splMarginaliaSessionImport";

export function useReaderImportJob() {
  const [job, setJob] = useState<ReaderImportJob | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const startGlaspCsvImport = useCallback(async (file: File) => {
    const parsed = parseGlaspCsv(await file.text());
    const nextJob: ReaderImportJob = {
      id: `import-${Date.now()}`,
      format: "glasp-csv",
      fileName: file.name,
      createdAt: new Date().toISOString(),
      rows: parsed.rows,
      activeRowId: parsed.rows[0]?.id,
      warnings: parsed.warnings,
    };
    setJob(nextJob);
    setDrawerOpen(true);
    return nextJob;
  }, []);

  const startSplSessionJsonImport = useCallback(async (file: File) => {
    const parsed = parseSplMarginaliaSessionImport(await file.text(), file.name);
    setJob(parsed.job);
    setDrawerOpen(true);
    return parsed.job;
  }, []);

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
    setJob((prev) => prev ? { ...prev, activeRowId: rowId } : prev);
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
    startGlaspCsvImport,
    startSplSessionJsonImport,
    clearJob,
    selectRow,
    setRowStatus,
    markRowAccepted: (jobId: string, rowId: string) => setSourcedRowStatus(jobId, rowId, "accepted"),
    markRowPending: (jobId: string, rowId: string) => setSourcedRowStatus(jobId, rowId, "pending"),
    skipRow: (rowId: string) => setRowStatus(rowId, "skipped"),
    unskipRow: (rowId: string) => setRowStatus(rowId, "pending"),
  };
}
