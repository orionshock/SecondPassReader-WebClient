import { useCallback, useEffect, useRef } from "react";
import type { ReaderSearchBookHandle } from "../shell/types";
import type { StagedSelectionHandle } from "../shell/stagedSelectionTypes";
import type { ReaderImportJob, ReaderImportRowStatus } from "./readerImportTypes";
import { normalizeImportedHighlightColor } from "./readerImportColors";
import { debugReaderImport, previewImportText } from "./readerImportDebug";
import { probeReaderImportBookmarkCfi } from "./readerImportBookmarkProbe";
import { buildReaderImportAttemptQueue, getNextReaderImportAttempt } from "./readerImportAttempts";
import { getNextImportCycleMatch } from "./readerImportCycle";
import { hasOtherStagedRows } from "./readerImportJobState";
import { findImportRowSearchMatches } from "./readerImportSearch";
import type { ReaderDisplayCfiHandle, ReaderProbeCfiHandle } from "../shell/types";
import { stageReaderImportHighlightCfi } from "./readerImportHighlightCfi";

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
  jumpToResult,
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
  setRowActivationState: (rowId: string, status: ReaderImportRowStatus, cycle?: { attemptCursor?: number; resultCursor?: number; hasMatched?: boolean }) => void;
  setDrawerOpen: (open: boolean) => void;
  jumpToResult: (cfi: string) => void;
  clearTemporaryHighlight: () => void;
  onBookmarkSuggested: (suggestion: { jobId: string; rowId: string; cfi: string }) => void;
}) {
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  return useCallback(async (rowId: string) => {
    const row = job?.rows.find((r) => r.id === rowId);
    if (!job || !row || row.status === "accepted" || row.status === "skipped" || row.status === "searching") {
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
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setRowStatus(rowId, "searching");
      debugReaderImport("bookmark CFI probe start", {
        rowId,
        hasCfiHint: Boolean(row.cfiHint?.trim()),
        cfiPreview: previewImportText(row.cfiHint),
      });
      try {
        debugReaderImport("bookmark CFI display start", { rowId, cfiPreview: previewImportText(row.cfiHint) });
        const outcome = await probeReaderImportBookmarkCfi({ cfiHint: row.cfiHint, probeCfi, displayCfi });
        if (requestIdRef.current !== requestId || controller.signal.aborted) return;
        if (outcome.result.ok) {
          debugReaderImport("bookmark CFI display success", {
            rowId,
            code: outcome.result.code,
            verification: outcome.result.code === "displayed" ? "exact" : "approximate",
          });
        } else {
          debugReaderImport("bookmark CFI display failure", {
            rowId,
            code: outcome.result.code,
            reason: outcome.result.error,
          });
        }
        setRowActivationState(rowId, outcome.status, { attemptCursor: row.attemptCursor, resultCursor: row.resultCursor, hasMatched: outcome.result.ok || row.hasMatched });
        if (outcome.status === "staged" && outcome.result.ok && row.cfiHint?.trim()) {
          onBookmarkSuggested({ jobId: job.id, rowId: row.id, cfi: row.cfiHint.trim() });
        }
        setDrawerOpen(true);
      } catch (error) {
        if (requestIdRef.current !== requestId || controller.signal.aborted) return;
        debugReaderImport("bookmark CFI probe error", {
          rowId,
          error: error instanceof Error ? error.message : String(error),
        });
        setRowActivationState(rowId, "not-found", { attemptCursor: row.attemptCursor, resultCursor: row.resultCursor, hasMatched: row.hasMatched });
        setDrawerOpen(true);
      }
      return;
    }

    const next = getNextReaderImportAttempt(row);
    if (!next) {
      debugReaderImport("no activation attempt", {
        rowId,
        kind: row.kind,
        quotePreview: previewImportText(row.quoteText),
        hasCfiHint: Boolean(row.cfiHint),
        attemptCursor: row.attemptCursor,
        resultCursor: row.resultCursor,
        hasMatched: row.hasMatched,
      });
      setRowStatus(rowId, "not-found");
      clearTemporaryHighlight();
      setDrawerOpen(true);
      return;
    }

    if (!stagedSelectionHandle) {
      debugReaderImport("activation dependencies missing", {
        rowId,
        hasSearchBook: Boolean(searchBook),
        hasStagedSelectionHandle: Boolean(stagedSelectionHandle),
      });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setRowStatus(rowId, "searching");

    try {
      const attempts = buildReaderImportAttemptQueue(row);
      let activationCursor = next.cursor;
      let activationResultCursor = next.resultCursor;
      debugReaderImport("activation start", {
        rowId,
        status: row.status,
        next: { kind: next.attempt.kind, cursor: next.cursor, resultCursor: next.resultCursor },
        attempts: attempts.map((attempt) => ({
          kind: attempt.kind,
          textPreview: previewImportText(attempt.kind === "quote-text" ? attempt.exact : attempt.kind === "text-search" ? attempt.text : attempt.cfiRange),
          hasPrefix: attempt.kind === "quote-text" ? Boolean(attempt.prefix) : undefined,
          hasSuffix: attempt.kind === "quote-text" ? Boolean(attempt.suffix) : undefined,
        })),
        quotePreview: previewImportText(row.quoteText),
        preQuotePreview: previewImportText(row.preQuoteText),
        postQuotePreview: previewImportText(row.postQuoteText),
        hasCfiHint: Boolean(row.cfiHint),
      });

      if (next.attempt.kind === "cfi-range") {
        debugReaderImport("highlight CFI range stage start", { rowId, cfiPreview: previewImportText(next.attempt.cfiRange) });
        const result = await stageReaderImportHighlightCfi({
          jobId: job.id,
          row,
          probeCfi,
          displayCfi,
          stagedSelection: stagedSelectionHandle,
        });
        if (requestIdRef.current !== requestId || controller.signal.aborted) return;
        if (result.ok) {
          debugReaderImport("highlight CFI range stage success", { rowId, code: result.code });
          setRowActivationState(rowId, "staged", { attemptCursor: next.cursor + 1, resultCursor: 0, hasMatched: true });
          return;
        }
        debugReaderImport("highlight CFI range stage failure", { rowId, code: result.code, reason: result.error });
        activationCursor = next.cursor + 1;
        activationResultCursor = 0;
      }

      if (!searchBook) {
        setRowActivationState(rowId, "not-found", { attemptCursor: activationCursor, resultCursor: activationResultCursor, hasMatched: row.hasMatched });
        setDrawerOpen(true);
        return;
      }
      const resultsByAttempt = await Promise.all(
        attempts.map((attempt) => attempt.kind === "cfi-range"
          ? Promise.resolve([])
          : findImportRowSearchMatches({ row, attempt, searchBook, signal: controller.signal })),
      );
      if (requestIdRef.current !== requestId || controller.signal.aborted) return;
      debugReaderImport("activation search results", {
        rowId,
        counts: resultsByAttempt.map((results, index) => ({ attemptKind: attempts[index]?.kind, count: results.length })),
      });
      const cycle = getNextImportCycleMatch(
        {
          attemptCursor: activationCursor,
          resultCursor: activationResultCursor,
          hasMatched: row.hasMatched,
        },
        resultsByAttempt,
      );

      if (!cycle) {
        debugReaderImport("activation no cycle match", {
          rowId,
          attemptKinds: attempts.map((attempt) => attempt.kind),
          counts: resultsByAttempt.map((results) => results.length),
          previousHasMatched: row.hasMatched,
        });
        setRowActivationState(rowId, "not-found", { attemptCursor: attempts.length, resultCursor: 0, hasMatched: row.hasMatched });
        clearTemporaryHighlight();
        setDrawerOpen(true);
        return;
      }

      const match = cycle.result;
      debugReaderImport("activation staging match", {
        rowId,
        cycle: {
          attemptIndex: cycle.attemptIndex,
          resultIndex: cycle.resultIndex,
          nextAttemptCursor: cycle.nextAttemptCursor,
          nextResultCursor: cycle.nextResultCursor,
        },
        cfi: match.result.cfi,
        queryPreview: previewImportText(match.query),
        matchedPreview: previewImportText(match.matchedText),
        hasQuotePrefix: Boolean(match.result.quotePrefix),
        hasQuoteSuffix: Boolean(match.result.quoteSuffix),
      });
      try {
        jumpToResult(match.result.cfi);
        if (requestIdRef.current !== requestId || controller.signal.aborted) return;
        stagedSelectionHandle.stageSelectionFromCfiRange({
          cfiRange: match.result.cfi,
          text: match.matchedText || row.quoteText || "",
          quotePrefix: match.result.quotePrefix,
          quoteSuffix: match.result.quoteSuffix,
          note: row.noteText,
          color: normalizeImportedHighlightColor(row.color),
          source: { kind: "import", importJobId: job.id, importRowId: row.id },
        });
        setRowActivationState(rowId, "staged", {
          attemptCursor: cycle.nextAttemptCursor,
          resultCursor: cycle.nextResultCursor,
          hasMatched: true,
        });
      } catch {
        debugReaderImport("activation staging failed", {
          rowId,
          cfi: match.result.cfi,
          attemptIndex: cycle.attemptIndex,
          resultIndex: cycle.resultIndex,
        });
        setRowActivationState(rowId, "not-found", {
          attemptCursor: cycle.nextAttemptCursor,
          resultCursor: cycle.nextResultCursor,
          hasMatched: row.hasMatched,
        });
        clearTemporaryHighlight();
        setDrawerOpen(true);
      }
    } catch (err) {
      if (requestIdRef.current !== requestId || controller.signal.aborted) return;
      debugReaderImport("activation error", { rowId, error: err instanceof Error ? err.message : String(err) });
      setRowActivationState(rowId, "not-found", { attemptCursor: next.cursor + 1, resultCursor: 0, hasMatched: row.hasMatched });
      clearTemporaryHighlight();
      setDrawerOpen(true);
    }
  }, [clearTemporaryHighlight, displayCfi, job, jumpToResult, onBookmarkSuggested, probeCfi, searchBook, selectRow, setDrawerOpen, setRowActivationState, setRowStatus, stagedSelectionHandle]);
}
