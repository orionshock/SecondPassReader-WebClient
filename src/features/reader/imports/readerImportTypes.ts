export type ReaderImportFormat = "glasp-csv" | "spl-session-json";
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
  readOnly?: boolean;
  sourceBook?: Record<string, unknown>;
  sourceSession?: Record<string, unknown>;
  sourceSummary?: {
    bookLabel: string;
    sessionLabel: string;
    annotationCount: number;
    commentCount: number;
    colorCount: number;
    deletedCount: number;
  };
};

export type ParsedReaderImport = {
  rows: ReaderImportRow[];
  warnings: string[];
};
