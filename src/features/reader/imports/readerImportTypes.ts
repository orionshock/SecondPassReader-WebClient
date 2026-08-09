export type ReaderImportRowStatus =
  | "pending"
  | "searching"
  | "staged"
  | "accepted"
  | "skipped"
  | "not-found"
  | "manually-completed";
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
  resultCursor?: number;
  hasMatched?: boolean;
  candidateIndex?: number;
  candidateCount?: number;
};

export type ReaderImportJob = {
  id: string;
  format: string;
  fileName: string;
  createdAt: string;
  rows: ReaderImportRow[];
  activeRowId?: string;
  warnings?: string[];
  summaryDisplay?: string;
};
