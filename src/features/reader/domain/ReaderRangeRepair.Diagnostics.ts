export type ReaderRangeRepairDiagnosticEvent =
  | "range repair skipped"
  | "range repair start"
  | "range repair failed"
  | "range repair success"
  | "range repair anchor fallback"
  | "range repair anchor direct match"
  | "range repair anchor window search"
  | "range repair CFI anchor lookup failed";

export type ReaderRangeRepairDiagnosticPreview = {
  key: string;
  value: string;
  maxLength?: number;
  verboseOnly?: boolean;
};

export type ReaderRangeRepairDiagnostic = {
  event: ReaderRangeRepairDiagnosticEvent;
  data?: Record<string, unknown>;
  previews?: ReaderRangeRepairDiagnosticPreview[];
};

export type ReaderRangeRepairDiagnosticHandler = (diagnostic: ReaderRangeRepairDiagnostic) => void;
