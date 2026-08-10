import type { ReaderDisplayCfiHandle, ReaderProbeCfiHandle, ReaderSearchBookHandle, StagedSelectionHandle } from "../domain/ReaderBridge.Types";
import {
  buildReaderImportAttemptQueue,
  getNextReaderImportAttempt,
  normalizeReaderImportAttemptCursor,
} from "./readerImportAttempts";
import { normalizeImportedHighlightColor } from "./readerImportColors";
import { getImportCycleCandidatePosition, getNextImportCycleMatch } from "./readerImportCycle";
import { debugReaderImport, isReaderImportDebugVerbose, previewImportText } from "./readerImportDebug";
import { stageReaderImportHighlightCfi } from "./readerImportHighlightCfi";
import { findImportRowSearchMatchesByAttempt } from "./readerImportSearch";
import type { ReaderImportRow, ReaderImportRowStatus } from "./readerImportTypes";

type ReaderImportActivationRequest = {
  signal: AbortSignal;
  isCurrent: () => boolean;
};

export async function activateReaderImportHighlight({
  jobId,
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
}: {
  jobId: string;
  row: ReaderImportRow;
  searchBook: ReaderSearchBookHandle | null;
  probeCfi: ReaderProbeCfiHandle | null;
  displayCfi: ReaderDisplayCfiHandle | null;
  stagedSelectionHandle: StagedSelectionHandle | null;
  beginRequest: () => ReaderImportActivationRequest;
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
}): Promise<void> {
  const rowId = row.id;
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

  const request = beginRequest();
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
        jobId,
        row,
        probeCfi,
        displayCfi,
        stagedSelection: stagedSelectionHandle,
      });
      if (!request.isCurrent() || request.signal.aborted) return;
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
      signal: request.signal,
    });
    if (!request.isCurrent() || request.signal.aborted) return;
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
        if (!request.isCurrent() || request.signal.aborted) return;
        if (!display.ok) throw new Error(display.error);
        await stagedSelectionHandle.stageSelectionFromCfiRange({
          cfiRange: match.result.cfi,
          text: match.matchedText || row.quoteText || "",
          quotePrefix: match.result.quotePrefix,
          quoteSuffix: match.result.quoteSuffix,
          note: row.noteText,
          color: normalizeImportedHighlightColor(row.color),
          source: { kind: "import", importJobId: jobId, importRowId: row.id },
        });
      });
      debugReaderImport("activation staged selection transaction complete", {
        rowId,
        cfi: verbose ? match.result.cfi : undefined,
      });
      if (!request.isCurrent() || request.signal.aborted) return;
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
    if (!request.isCurrent() || request.signal.aborted) return;
    debugReaderImport("activation error", { rowId, error: err instanceof Error ? err.message : String(err) });
    setRowActivationState(rowId, "not-found", { attemptCursor: next.cursor + 1, resultCursor: 0, hasMatched: row.hasMatched });
    clearTemporaryHighlight();
    setDrawerOpen(true);
  }
}
