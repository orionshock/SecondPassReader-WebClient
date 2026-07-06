import { useCallback, useEffect, useRef } from "react";
import type { ReaderSearchBookHandle } from "../shell/types";
import type { StagedSelectionHandle } from "../shell/stagedSelectionTypes";
import type { ReaderImportJob, ReaderImportRowStatus } from "./readerImportTypes";
import { findImportRowSearchMatch } from "./readerImportSearch";

export function useReaderImportActivation({
  job,
  searchBook,
  stagedSelectionHandle,
  selectRow,
  setRowStatus,
  setDrawerOpen,
  jumpToResult,
}: {
  job: ReaderImportJob | null;
  searchBook: ReaderSearchBookHandle | null;
  stagedSelectionHandle: StagedSelectionHandle | null;
  selectRow: (rowId: string) => void;
  setRowStatus: (rowId: string, status: ReaderImportRowStatus) => void;
  setDrawerOpen: (open: boolean) => void;
  jumpToResult: (cfi: string) => void;
}) {
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  return useCallback(async (rowId: string) => {
    const row = job?.rows.find((r) => r.id === rowId);
    if (!job || !row || row.status === "accepted" || row.status === "skipped") return;
    selectRow(rowId);
    if (row.kind === "bookmark") {
      setDrawerOpen(true);
      return;
    }
    if (!searchBook || !stagedSelectionHandle) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setRowStatus(rowId, "searching");

    try {
      const match = await findImportRowSearchMatch({ row, searchBook, signal: controller.signal });
      if (requestIdRef.current !== requestId || controller.signal.aborted) return;
      if (!match) {
        setRowStatus(rowId, "not-found");
        setDrawerOpen(true);
        return;
      }

      jumpToResult(match.result.cfi);
      stagedSelectionHandle.stageSelectionFromCfiRange({
        cfiRange: match.result.cfi,
        text: match.matchedText || row.importedText,
        quotePrefix: match.result.quotePrefix,
        quoteSuffix: match.result.quoteSuffix,
        note: row.importedNote,
        color: row.normalizedColor,
        source: { kind: "import", importJobId: job.id, importRowId: row.id },
      });
      setRowStatus(rowId, "staged");
    } catch (err) {
      if (requestIdRef.current !== requestId || controller.signal.aborted) return;
      setRowStatus(rowId, "not-found");
      setDrawerOpen(true);
    }
  }, [job, jumpToResult, searchBook, selectRow, setDrawerOpen, setRowStatus, stagedSelectionHandle]);
}
