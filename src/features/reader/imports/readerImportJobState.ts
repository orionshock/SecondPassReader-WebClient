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
  return rows.map((row) => row.id === suggestion.rowId && row.kind === "bookmark" ? { ...row, status: "accepted" } : row);
}

export function resetOtherStagedRowsForActivation(rows: ReaderImportRow[], activeRowId: string): ReaderImportRow[] {
  return rows.map((row) => {
    if (row.id === activeRowId || row.status !== "staged") return row;
    return { ...row, status: "pending" };
  });
}

export function hasOtherStagedRows(rows: ReaderImportRow[], activeRowId: string): boolean {
  return rows.some((row) => row.id !== activeRowId && row.status === "staged");
}
