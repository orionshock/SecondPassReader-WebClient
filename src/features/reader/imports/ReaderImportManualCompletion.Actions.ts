import type { ReaderImportRow } from "./ReaderImport.Types";
import { isReaderImportRowTerminal } from "./ReaderImportJob.State";

export function completeReaderImportRowManually({
  row,
  cancelStagedSelection,
  clearTemporaryHighlight,
  markRowManuallyCompleted,
}: {
  row: ReaderImportRow | undefined;
  cancelStagedSelection: () => void;
  clearTemporaryHighlight: () => void;
  markRowManuallyCompleted: (rowId: string) => void;
}): boolean {
  if (!row || isReaderImportRowTerminal(row.status) || row.status === "searching") return false;

  if (row.status === "staged") {
    cancelStagedSelection();
    clearTemporaryHighlight();
  }
  markRowManuallyCompleted(row.id);
  return true;
}
