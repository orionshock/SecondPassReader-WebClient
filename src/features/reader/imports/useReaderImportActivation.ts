import { useCallback, useEffect, useRef } from "react";
import type { ReaderSearchBookHandle } from "../shell/types";
import type { StagedSelectionHandle } from "../shell/stagedSelectionTypes";
import type { ReaderImportJob, ReaderImportRowStatus } from "./readerImportTypes";
import { normalizeImportedHighlightColor } from "./readerImportColors";
import { buildReaderImportAttemptQueue, getNextReaderImportAttempt } from "./readerImportAttempts";
import { hasOtherStagedRows } from "./readerImportJobState";
import { findImportRowSearchMatch } from "./readerImportSearch";

export function useReaderImportActivation({
  job,
  searchBook,
  stagedSelectionHandle,
  selectRow,
  setRowStatus,
  setRowActivationState,
  setDrawerOpen,
  jumpToResult,
}: {
  job: ReaderImportJob | null;
  searchBook: ReaderSearchBookHandle | null;
  stagedSelectionHandle: StagedSelectionHandle | null;
  selectRow: (rowId: string) => void;
  setRowStatus: (rowId: string, status: ReaderImportRowStatus) => void;
  setRowActivationState: (rowId: string, status: ReaderImportRowStatus, attemptCursor?: number) => void;
  setDrawerOpen: (open: boolean) => void;
  jumpToResult: (cfi: string) => void;
}) {
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  return useCallback(async (rowId: string) => {
    const row = job?.rows.find((r) => r.id === rowId);
    if (!job || !row || row.status === "accepted" || row.status === "skipped" || row.status === "searching") return;
    if (row.status === "staged" || hasOtherStagedRows(job.rows, rowId)) stagedSelectionHandle?.cancelStagedSelection();
    selectRow(rowId);
    const next = getNextReaderImportAttempt(row);
    if (!next) {
      setRowStatus(rowId, "not-found");
      setDrawerOpen(true);
      return;
    }

    if (next.attempt.kind === "selector-cfi") {
      if (!stagedSelectionHandle) return;
      try {
        jumpToResult(next.attempt.cfi);
        stagedSelectionHandle.stageSelectionFromCfiRange({
          cfiRange: next.attempt.cfi,
          text: row.quoteText ?? "",
          quotePrefix: row.preQuoteText,
          quoteSuffix: row.postQuoteText,
          note: row.noteText,
          color: normalizeImportedHighlightColor(row.color),
          source: { kind: "import", importJobId: job.id, importRowId: row.id },
        });
        setRowActivationState(rowId, "staged", next.nextCursor);
      } catch {
        setRowActivationState(rowId, "not-found", next.nextCursor);
        setDrawerOpen(true);
      }
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
      const attempts = buildReaderImportAttemptQueue(row);
      for (let cursor = next.cursor; cursor < attempts.length; cursor += 1) {
        const attempt = attempts[cursor]!;
        if (attempt.kind === "selector-cfi") continue;
        const match = await findImportRowSearchMatch({ row, attempt, searchBook, signal: controller.signal });
        if (requestIdRef.current !== requestId || controller.signal.aborted) return;
        if (!match) continue;

        jumpToResult(match.result.cfi);
        stagedSelectionHandle.stageSelectionFromCfiRange({
          cfiRange: match.result.cfi,
          text: match.matchedText || row.quoteText || "",
          quotePrefix: match.result.quotePrefix,
          quoteSuffix: match.result.quoteSuffix,
          note: row.noteText,
          color: normalizeImportedHighlightColor(row.color),
          source: { kind: "import", importJobId: job.id, importRowId: row.id },
        });
        setRowActivationState(rowId, "staged", cursor + 1);
        return;
      }

      setRowActivationState(rowId, "not-found", attempts.length);
      setDrawerOpen(true);
    } catch (err) {
      if (requestIdRef.current !== requestId || controller.signal.aborted) return;
      setRowActivationState(rowId, "not-found", next.nextCursor);
      setDrawerOpen(true);
    }
  }, [job, jumpToResult, searchBook, selectRow, setDrawerOpen, setRowActivationState, setRowStatus, stagedSelectionHandle]);
}
