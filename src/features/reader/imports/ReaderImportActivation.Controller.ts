import { useCallback, useEffect, useRef } from "react";
import type { ReaderSearchBookHandle, StagedSelectionHandle } from "../domain/ReaderBridge.Types";
import type { ReaderImportJob, ReaderImportRowStatus } from "./ReaderImport.Types";
import { debugReaderImport } from "./ReaderImportDebug.Diagnostics";
import { hasOtherStagedRows, isReaderImportRowTerminal } from "./ReaderImportJob.State";
import type { ReaderDisplayCfiHandle, ReaderProbeCfiHandle } from "../domain/ReaderBridge.Types";
import { activateReaderImportBookmark } from "./ReaderImportActivationBookmark.Actions";
import { activateReaderImportHighlight } from "./ReaderImportActivationHighlight.Actions";
import type { ReaderImportReviewLifetime } from "./ReaderImportReview.Lifecycle";

export function useReaderImportActivation({
  job,
  reviewOpen,
  lifetime,
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
  reviewOpen: boolean;
  lifetime: ReaderImportReviewLifetime;
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
  const jobIdRef = useRef(job?.id ?? null);
  const reviewOpenRef = useRef(reviewOpen);
  jobIdRef.current = job?.id ?? null;
  reviewOpenRef.current = reviewOpen;

  const invalidate = useCallback(() => {
    // Import work may outlive its review. Advance ownership before cleanup so a
    // late completion cannot recreate temporary marks or reopen the drawer.
    lifetime.invalidate();
  }, [lifetime]);

  useEffect(() => invalidate, [invalidate]);

  const activateRow = useCallback(async (rowId: string) => {
    const beginRequest = () => {
      const jobId = job!.id;
      return lifetime.beginActivation(jobId, rowId, () => jobIdRef.current === jobId && reviewOpenRef.current);
    };
    const row = job?.rows.find((r) => r.id === rowId);
    if (!reviewOpen || !job || !row || isReaderImportRowTerminal(row.status) || row.status === "searching") {
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
  }, [clearTemporaryHighlight, displayCfi, job, lifetime, onBookmarkSuggested, probeCfi, reviewOpen, searchBook, selectRow, setDrawerOpen, setRowActivationState, setRowStatus, stagedSelectionHandle]);

  return { activateRow, invalidate };
}
