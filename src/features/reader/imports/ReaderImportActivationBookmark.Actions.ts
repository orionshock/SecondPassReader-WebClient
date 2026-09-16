import type { ReaderDisplayCfiHandle, ReaderProbeCfiHandle } from "../domain/ReaderBridge.Types";
import { debugReaderImport, previewImportText } from "./ReaderImportDebug.Diagnostics";
import { probeReaderImportBookmarkCfi } from "./ReaderImportBookmarkProbe.Actions";
import type { ReaderImportRow, ReaderImportRowStatus } from "./ReaderImport.Types";

export async function activateReaderImportBookmark({
  jobId,
  row,
  probeCfi,
  displayCfi,
  signal,
  isCurrent,
  setRowStatus,
  setRowActivationState,
  setDrawerOpen,
  onBookmarkSuggested,
}: {
  jobId: string;
  row: ReaderImportRow;
  probeCfi: ReaderProbeCfiHandle | null;
  displayCfi: ReaderDisplayCfiHandle | null;
  signal: AbortSignal;
  isCurrent: () => boolean;
  setRowStatus: (rowId: string, status: ReaderImportRowStatus) => void;
  setRowActivationState: (rowId: string, status: ReaderImportRowStatus, cycle?: {
    attemptCursor?: number;
    resultCursor?: number;
    hasMatched?: boolean;
    candidateIndex?: number;
    candidateCount?: number;
  }) => void;
  setDrawerOpen: (open: boolean) => void;
  onBookmarkSuggested: (suggestion: { jobId: string; rowId: string; cfi: string }) => void;
}): Promise<void> {
  setRowStatus(row.id, "searching");
  debugReaderImport("bookmark CFI activation start", {
    rowId: row.id,
    hasCfiHint: Boolean(row.cfiHint?.trim()),
    cfiPreview: previewImportText(row.cfiHint),
  });
  try {
    const outcome = await probeReaderImportBookmarkCfi({ cfiHint: row.cfiHint, probeCfi, displayCfi, rowId: row.id, isCurrent });
    if (!isCurrent() || signal.aborted) return;
    if (!outcome) return;
    setRowActivationState(row.id, outcome.status, {
      attemptCursor: row.attemptCursor,
      resultCursor: row.resultCursor,
      hasMatched: outcome.result.ok || row.hasMatched,
    });
    if (outcome.status === "staged" && outcome.result.ok && row.cfiHint?.trim()) {
      onBookmarkSuggested({ jobId, rowId: row.id, cfi: row.cfiHint.trim() });
    }
    setDrawerOpen(true);
  } catch (error) {
    if (!isCurrent() || signal.aborted) return;
    debugReaderImport("bookmark CFI probe error", {
      rowId: row.id,
      error: error instanceof Error ? error.message : String(error),
    });
    setRowActivationState(row.id, "not-found", {
      attemptCursor: row.attemptCursor,
      resultCursor: row.resultCursor,
      hasMatched: row.hasMatched,
    });
    setDrawerOpen(true);
  }
}
