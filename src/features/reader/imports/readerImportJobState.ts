import type { ReaderImportRow, ReaderImportRowStatus } from "./readerImportTypes";

export type ReaderImportJobCounts = {
  pending: number;
  accepted: number;
  skipped: number;
  notFound: number;
  manuallyCompleted: number;
};

export type ReaderImportBookmarkSuggestion = {
  jobId: string;
  rowId: string;
  cfi: string;
};

export function createBookmarkSuggestion(jobId: string, row: ReaderImportRow): ReaderImportBookmarkSuggestion | null {
  const cfi = row.cfiHint?.trim() ?? "";
  if (row.kind !== "bookmark" || row.status !== "staged" || !cfi) return null;
  return { jobId, rowId: row.id, cfi };
}

export function acceptSuggestedBookmarkRow(rows: ReaderImportRow[], suggestion: ReaderImportBookmarkSuggestion): ReaderImportRow[] {
  return rows.map((row) => row.id === suggestion.rowId && row.kind === "bookmark"
    ? setReaderImportRowStatus(row, "accepted")
    : row);
}

export function resetOtherStagedRowsForActivation(rows: ReaderImportRow[], activeRowId: string): ReaderImportRow[] {
  return rows.map((row) => {
    if (row.id === activeRowId || row.status !== "staged") return row;
    return setReaderImportRowStatus(row, "pending");
  });
}

export function resetStagedRowsForNavigation(rows: ReaderImportRow[]): ReaderImportRow[] {
  return rows.map((row) => row.status === "staged" ? setReaderImportRowStatus(row, "pending") : row);
}

export function undoReaderImportManualCompletion(row: ReaderImportRow): ReaderImportRow {
  return row.status === "manually-completed" ? setReaderImportRowStatus(row, "pending") : row;
}

export function setReaderImportRowStatus(
  row: ReaderImportRow,
  status: ReaderImportRow["status"],
  activation?: Pick<ReaderImportRow, "attemptCursor" | "resultCursor" | "hasMatched" | "candidateIndex" | "candidateCount">,
): ReaderImportRow {
  const { candidateIndex: _candidateIndex, candidateCount: _candidateCount, ...rest } = row;
  return status === "staged"
    ? { ...rest, status, ...activation }
    : { ...rest, status, ...withoutCandidatePosition(activation) };
}

export function isReaderImportRowTerminal(status: ReaderImportRowStatus): boolean {
  return status === "accepted" || status === "skipped" || status === "manually-completed";
}

export function isReaderImportRowResolved(status: ReaderImportRowStatus): boolean {
  return isReaderImportRowTerminal(status) || status === "not-found";
}

export function getReaderImportJobCounts(rows: ReaderImportRow[]): ReaderImportJobCounts {
  const counts: ReaderImportJobCounts = {
    pending: 0,
    accepted: 0,
    skipped: 0,
    notFound: 0,
    manuallyCompleted: 0,
  };
  for (const row of rows) {
    if (row.status === "accepted") counts.accepted += 1;
    else if (row.status === "skipped") counts.skipped += 1;
    else if (row.status === "not-found") counts.notFound += 1;
    else if (row.status === "manually-completed") counts.manuallyCompleted += 1;
    else counts.pending += 1;
  }
  return counts;
}

function withoutCandidatePosition(
  activation: Pick<ReaderImportRow, "attemptCursor" | "resultCursor" | "hasMatched" | "candidateIndex" | "candidateCount"> | undefined,
): Pick<ReaderImportRow, "attemptCursor" | "resultCursor" | "hasMatched"> | undefined {
  if (!activation) return undefined;
  const { attemptCursor, resultCursor, hasMatched } = activation;
  return { attemptCursor, resultCursor, hasMatched };
}

export function hasOtherStagedRows(rows: ReaderImportRow[], activeRowId: string): boolean {
  return rows.some((row) => row.id !== activeRowId && row.status === "staged");
}
