import type { ReaderImportRow } from "../../../features/reader/imports/ReaderImport.Types";

export const reviewableImportStatuses = ["pending", "not-found"] as const;
export const terminalImportStatuses = ["searching", "accepted", "skipped", "manually-completed"] as const;

export const importProse = {
  dorogaQuote: "\u201cIt is too late to save them,\u201d Doroga rumbled. \u201cThis is how it begins.\u201d",
  dorogaFragment: "Doroga rumbled",
  dorogaRepairText: '"It is too late to save them," Doroga rumbled.',
} as const;

export function readerImportRow(overrides: Partial<ReaderImportRow> = {}): ReaderImportRow {
  return {
    id: "row-1",
    kind: "highlight",
    index: 1,
    quoteText: "Imported quote",
    status: "pending",
    ...overrides,
  };
}

export function readerImportRowsWithStatuses(...statuses: ReaderImportRow["status"][]): ReaderImportRow[] {
  return statuses.map((status, index) => readerImportRow({
    id: `row-${index}`,
    index: index + 1,
    quoteText: `quote-${status}`,
    status,
  }));
}
