import type { ReaderImportRow } from "./readerImportTypes";

export function resetOtherStagedRowsForActivation(rows: ReaderImportRow[], activeRowId: string): ReaderImportRow[] {
  return rows.map((row) => {
    if (row.id === activeRowId || row.status !== "staged") return row;
    return { ...row, status: "pending" };
  });
}

export function hasOtherStagedRows(rows: ReaderImportRow[], activeRowId: string): boolean {
  return rows.some((row) => row.id !== activeRowId && row.status === "staged");
}
