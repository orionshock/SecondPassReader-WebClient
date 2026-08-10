import { useCallback, useEffect, useRef } from "react";
import type { ReaderSearchBookHandle, StagedSelectionHandle } from "../domain/ReaderBridge.Types";
import type { ReaderImportJob, ReaderImportRowStatus } from "./readerImportTypes";
import { debugReaderImport } from "./readerImportDebug";
import { hasOtherStagedRows, isReaderImportRowTerminal } from "./readerImportJobState";
import type { ReaderDisplayCfiHandle, ReaderProbeCfiHandle } from "../domain/ReaderBridge.Types";
import { activateReaderImportBookmark } from "./ReaderImportActivationBookmark.Actions";
import { activateReaderImportHighlight } from "./ReaderImportActivationHighlight.Actions";

export function useReaderImportActivation({
  job,
  searchBook,
  probeCfi,
  displayCfi,
  stagedSelectionHandle,
  selectRow,
  setRowStatus,
  setRowActivationState,
  setDrawerOpen,
  clearTemporaryHighlight,
  onBookmarkSuggested,
}: {
  job: ReaderImportJob | null;
  searchBook: ReaderSearchBookHandle | null;
  probeCfi: ReaderProbeCfiHandle | null;
  displayCfi: ReaderDisplayCfiHandle | null;
  stagedSelectionHandle: StagedSelectionHandle | null;
  selectRow: (rowId: string) => void;
  setRowStatus: (rowId: string, status: ReaderImportRowStatus) => void;
  setRowActivationState: (rowId: string, status: ReaderImportRowStatus, cycle?: {
    attemptCursor?: number;
    resultCursor?: number;
    hasMatched?: boolean;
    candidateIndex?: number;
    candidateCount?: number;
  }) => void;
  setDrawerOpen: (open: boolean) => void;
  clearTemporaryHighlight: () => void;
  onBookmarkSuggested: (suggestion: { jobId: string; rowId: string; cfi: string }) => void;
}) {
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  return useCallback(async (rowId: string) => {
    const beginRequest = () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      return {
        signal: controller.signal,
        isCurrent: () => requestIdRef.current === requestId,
      };
    };
    const row = job?.rows.find((r) => r.id === rowId);
    if (!job || !row || isReaderImportRowTerminal(row.status) || row.status === "searching") {
      debugReaderImport("activation skipped", {
        rowId,
        hasJob: Boolean(job),
        rowStatus: row?.status,
      });
      return;
    }
    clearTemporaryHighlight();
    if (row.status === "staged" || hasOtherStagedRows(job.rows, rowId)) stagedSelectionHandle?.cancelStagedSelection();
    selectRow(rowId);
    if (row.kind === "bookmark") {
      const request = beginRequest();
      await activateReaderImportBookmark({
        jobId: job.id,
        row,
        probeCfi,
        displayCfi,
        signal: request.signal,
        isCurrent: request.isCurrent,
        setRowStatus,
        setRowActivationState,
        setDrawerOpen,
        onBookmarkSuggested,
      });
      return;
    }
    await activateReaderImportHighlight({
      jobId: job.id,
      row,
      searchBook,
      probeCfi,
      displayCfi,
      stagedSelectionHandle,
      beginRequest,
      setRowStatus,
      setRowActivationState,
      setDrawerOpen,
      clearTemporaryHighlight,
    });
  }, [clearTemporaryHighlight, displayCfi, job, onBookmarkSuggested, probeCfi, searchBook, selectRow, setDrawerOpen, setRowActivationState, setRowStatus, stagedSelectionHandle]);
}
