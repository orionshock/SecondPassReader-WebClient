import type { ReaderImportRow } from "./readerImportTypes";

export type ReaderImportActivationEligibility =
  | { kind: "text-search" }
  | { kind: "bookmark-location" }
  | { kind: "not-searchable"; reason: "missing-text" };

export function getReaderImportActivationEligibility(row: ReaderImportRow): ReaderImportActivationEligibility {
  if (row.kind === "bookmark") return { kind: "bookmark-location" };
  return row.importedText.trim() ? { kind: "text-search" } : { kind: "not-searchable", reason: "missing-text" };
}
