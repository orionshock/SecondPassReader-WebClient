export type ReaderImportFormat = "glasp-csv" | "spl-session-json";
export type ReaderHighlightColor = "yellow" | "green" | "blue" | "pink" | "purple";
export type ReaderImportRowStatus = "pending" | "searching" | "staged" | "accepted" | "skipped" | "not-found";
export type ReaderImportRowKind = "highlight" | "bookmark";
export type ReaderImportSelectorHint = {
  kind: "epub_cfi";
  value: string;
};

export type ReaderImportRow = {
  id: string;
  kind: ReaderImportRowKind;
  index: number;
  importedText: string;
  importedNote?: string;
  importedColor?: string;
  normalizedColor?: ReaderHighlightColor;
  importedLocation?: string;
  selectorHint?: ReaderImportSelectorHint;
  status: ReaderImportRowStatus;
  rawAnnotation?: Record<string, unknown>;
};

export type ReaderImportJob = {
  id: string;
  format: ReaderImportFormat;
  fileName: string;
  createdAt: string;
  rows: ReaderImportRow[];
  activeRowId?: string;
  warnings?: string[];
  summaryDisplay?: string;
};
