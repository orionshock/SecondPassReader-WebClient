export type ReaderImportFormat = "glasp-csv";
export type ReaderHighlightColor = "yellow" | "green" | "blue" | "pink" | "purple";
export type ReaderImportRowStatus = "pending" | "searching" | "staged" | "accepted" | "skipped" | "not-found";

export type ReaderImportRow = {
  id: string;
  index: number;
  importedText: string;
  importedNote?: string;
  importedColor?: string;
  normalizedColor?: ReaderHighlightColor;
  importedLocation?: string;
  status: ReaderImportRowStatus;
};

export type ReaderImportJob = {
  id: string;
  format: ReaderImportFormat;
  fileName: string;
  createdAt: string;
  rows: ReaderImportRow[];
  activeRowId?: string;
  warnings?: string[];
};

export type ParsedReaderImport = {
  rows: ReaderImportRow[];
  warnings: string[];
};
