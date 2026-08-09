import { useCallback, useEffect, useRef } from "react";
import type { ReaderSearchBookHandle, StagedSelectionHandle } from "../domain/ReaderBridge.Types";
import type { ReaderImportJob, ReaderImportRowStatus } from "./readerImportTypes";
import { normalizeImportedHighlightColor } from "./readerImportColors";
import { debugReaderImport, isReaderImportDebugVerbose, previewImportText } from "./readerImportDebug";
import { probeReaderImportBookmarkCfi } from "./readerImportBookmarkProbe";
import {
  buildReaderImportAttemptQueue,
  getNextReaderImportAttempt,
  normalizeReaderImportAttemptCursor,
} from "./readerImportAttempts";
import { getImportCycleCandidatePosition, getNextImportCycleMatch } from "./readerImportCycle";
import { hasOtherStagedRows } from "./readerImportJobState";
import { findImportRowSearchMatchesByAttempt } from "./readerImportSearch";
import type { ReaderDisplayCfiHandle, ReaderProbeCfiHandle } from "../domain/ReaderBridge.Types";
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
      debugReaderImport("bookmark CFI activation start", {
        rowId,
        hasCfiHint: Boolean(row.cfiHint?.trim()),
        cfiPreview: previewImportText(row.cfiHint),
      });
      try {
        const outcome = await probeReaderImportBookmarkCfi({ cfiHint: row.cfiHint, probeCfi, displayCfi, rowId });
        if (requestIdRef.current !== requestId || controller.signal.aborted) return;
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

    const attempts = buildReaderImportAttemptQueue(row);
    const normalizedCursor = normalizeReaderImportAttemptCursor(row, attempts.length);
    const verbose = isReaderImportDebugVerbose();
    debugReaderImport("activation attempt list created", {
      rowId,
      attemptKinds: attempts.map((attempt) => attempt.kind),
      attemptCursor: row.attemptCursor,
      resultCursor: row.resultCursor,
      attemptPreviews: verbose ? attempts.map((attempt) => previewImportText(
        attempt.kind === "quote-text" ? attempt.exact : attempt.kind === "text-search" ? attempt.text : attempt.cfiRange,
      )) : undefined,
    });
    if (row.cfiHint?.trim() && !attempts.some((attempt) => attempt.kind === "cfi-range")) {
      debugReaderImport("highlight CFI attempt skipped", {
        rowId,
        reason: "hint is not a usable range CFI",
        hasTextFallback: attempts.some((attempt) => attempt.kind !== "cfi-range"),
        cfiPreview: verbose ? previewImportText(row.cfiHint) : undefined,
      });
    }
    if (normalizedCursor.normalized) {
      debugReaderImport("activation cursor normalized", {
        rowId,
        attemptCount: attempts.length,
        oldAttemptCursor: row.attemptCursor,
        newAttemptCursor: normalizedCursor.cursor,
        oldResultCursor: row.resultCursor,
        newResultCursor: normalizedCursor.resultCursor,
        hasMatched: row.hasMatched,
        status: row.status,
      });
    }

    const next = getNextReaderImportAttempt(row);
    if (!next) {
      debugReaderImport("no activation attempt", {
        rowId,
        kind: row.kind,
        quotePreview: verbose ? previewImportText(row.quoteText) : undefined,
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
      setRowActivationState(rowId, "not-found", {
        attemptCursor: next.cursor,
        resultCursor: next.resultCursor,
        hasMatched: row.hasMatched,
      });
      clearTemporaryHighlight();
      setDrawerOpen(true);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setRowStatus(rowId, "searching");

    try {
      let activationCursor = next.cursor;
      let activationResultCursor = next.resultCursor;
      let failedCfiAttempt = false;
      debugReaderImport("activation start", {
        rowId,
        status: row.status,
        next: { kind: next.attempt.kind, cursor: next.cursor, resultCursor: next.resultCursor },
        attemptKinds: attempts.map((attempt) => attempt.kind),
        quotePreview: verbose ? previewImportText(row.quoteText) : undefined,
        preQuotePreview: verbose ? previewImportText(row.preQuoteText) : undefined,
        postQuotePreview: verbose ? previewImportText(row.postQuoteText) : undefined,
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
        failedCfiAttempt = true;
        debugReaderImport("highlight CFI range stage failure; continuing to text fallback", {
          rowId,
          code: result.code,
          reason: result.error,
          nextAttemptCursor: next.cursor + 1,
        });
        activationCursor = next.cursor + 1;
        activationResultCursor = 0;
      }

      if (!searchBook) {
        setRowActivationState(rowId, "not-found", { attemptCursor: activationCursor, resultCursor: activationResultCursor, hasMatched: row.hasMatched });
        setDrawerOpen(true);
        return;
      }
      const resultsByAttempt = await findImportRowSearchMatchesByAttempt({
        row,
        attempts,
        searchBook,
        signal: controller.signal,
      });
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
        setRowActivationState(rowId, "not-found", {
          attemptCursor: failedCfiAttempt ? activationCursor : attempts.length,
          resultCursor: 0,
          hasMatched: row.hasMatched,
        });
        clearTemporaryHighlight();
        setDrawerOpen(true);
        return;
      }

      const match = cycle.result;
      const candidatePosition = getImportCycleCandidatePosition(cycle, resultsByAttempt);
      debugReaderImport("activation staging match", {
        rowId,
        cycle: {
          attemptIndex: cycle.attemptIndex,
          resultIndex: cycle.resultIndex,
          nextAttemptCursor: cycle.nextAttemptCursor,
          nextResultCursor: cycle.nextResultCursor,
        },
        cfi: match.result.cfi,
        queryPreview: verbose ? previewImportText(match.query) : undefined,
        matchedPreview: verbose ? previewImportText(match.matchedText) : undefined,
        hasQuotePrefix: Boolean(match.result.quotePrefix),
        hasQuoteSuffix: Boolean(match.result.quoteSuffix),
      });
      try {
        if (!displayCfi) throw new Error("Safe CFI display is unavailable.");
        await stagedSelectionHandle.runStagingTransaction(async () => {
          const display = await displayCfi(match.result.cfi, { navigationIntent: "import-staging" });
          if (requestIdRef.current !== requestId || controller.signal.aborted) return;
          if (!display.ok) throw new Error(display.error);
          await stagedSelectionHandle.stageSelectionFromCfiRange({
            cfiRange: match.result.cfi,
            text: match.matchedText || row.quoteText || "",
            quotePrefix: match.result.quotePrefix,
            quoteSuffix: match.result.quoteSuffix,
            note: row.noteText,
            color: normalizeImportedHighlightColor(row.color),
            source: { kind: "import", importJobId: job.id, importRowId: row.id },
          });
        });
        if (requestIdRef.current !== requestId || controller.signal.aborted) return;
        setRowActivationState(rowId, "staged", {
          attemptCursor: cycle.nextAttemptCursor,
          resultCursor: cycle.nextResultCursor,
          hasMatched: true,
          ...candidatePosition ?? {},
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
  }, [clearTemporaryHighlight, displayCfi, job, onBookmarkSuggested, probeCfi, searchBook, selectRow, setDrawerOpen, setRowActivationState, setRowStatus, stagedSelectionHandle]);
}
