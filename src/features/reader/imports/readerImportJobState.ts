import type { ReaderImportRow } from "./readerImportTypes";

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
