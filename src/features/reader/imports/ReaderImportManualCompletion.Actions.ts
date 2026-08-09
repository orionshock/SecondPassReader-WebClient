import type { ReaderImportRow } from "./readerImportTypes";

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
  if (row?.status !== "staged") return false;

  cancelStagedSelection();
  clearTemporaryHighlight();
  markRowManuallyCompleted(row.id);
  return true;
}
