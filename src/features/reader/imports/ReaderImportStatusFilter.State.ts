import type { ReaderImportRow, ReaderImportRowStatus } from "./ReaderImport.Types";

export const READER_IMPORT_STATUS_GROUPS = [
  "pending",
  "accepted",
  "skipped",
  "not-found",
  "manually-completed",
] as const;

export type ReaderImportStatusGroup = (typeof READER_IMPORT_STATUS_GROUPS)[number];
export type ReaderImportStatusFilters = Record<ReaderImportStatusGroup, boolean>;

export function createDefaultReaderImportStatusFilters(): ReaderImportStatusFilters {
  return {
    pending: true,
    accepted: false,
    skipped: false,
    "not-found": true,
    "manually-completed": false,
  };
}

export function showAllReaderImportStatusFilters(): ReaderImportStatusFilters {
  return {
    pending: true,
    accepted: true,
    skipped: true,
    "not-found": true,
    "manually-completed": true,
  };
}

export function toggleReaderImportStatusFilter(
  filters: ReaderImportStatusFilters,
  group: ReaderImportStatusGroup,
): ReaderImportStatusFilters {
  return { ...filters, [group]: !filters[group] };
}

export function getReaderImportStatusGroup(status: ReaderImportRowStatus): ReaderImportStatusGroup {
  if (status === "searching" || status === "staged") return "pending";
  return status;
}

export function filterReaderImportRows(
  rows: ReaderImportRow[],
  filters: ReaderImportStatusFilters,
): ReaderImportRow[] {
  return rows.filter((row) => filters[getReaderImportStatusGroup(row.status)]);
}

export function areAllReaderImportStatusFiltersEnabled(filters: ReaderImportStatusFilters): boolean {
  return READER_IMPORT_STATUS_GROUPS.every((group) => filters[group]);
}
