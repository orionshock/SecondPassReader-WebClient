export type ReaderImportFormat = "glasp-csv" | "spl-session-json";
export type ReaderHighlightColor = "yellow" | "green" | "blue" | "pink" | "purple";
export type ReaderImportRowStatus = "pending" | "searching" | "staged" | "accepted" | "skipped" | "not-found";
export type ReaderImportRowKind = "highlight" | "bookmark";

export type ReaderImportRow = {
  id: string;
  kind: ReaderImportRowKind;
  index: number;
  quoteText?: string;
  preQuoteText?: string;
  postQuoteText?: string;
  cfiHint?: string;
  noteText?: string;
  color?: string;
  status: ReaderImportRowStatus;
  attemptCursor?: number;
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
