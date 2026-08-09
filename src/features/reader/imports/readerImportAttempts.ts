import type { ReaderImportRow } from "./readerImportTypes";
import { isReaderCfiRange } from "../engine/ReaderCfiClassifier.Engine";

export type ReaderImportAttempt =
  | { kind: "cfi-range"; cfiRange: string }
  | { kind: "quote-text"; exact: string; prefix?: string; suffix?: string }
  | { kind: "text-search"; text: string };

export type ReaderImportAttemptCursor = {
  cursor: number;
  resultCursor: number;
  normalized: boolean;
};

export function buildReaderImportAttemptQueue(row: ReaderImportRow): ReaderImportAttempt[] {
  if (row.kind !== "highlight") return [];

  const attempts: ReaderImportAttempt[] = [];
  const text = row.quoteText?.trim() ?? "";

  const cfiRange = row.cfiHint?.trim() ?? "";
  if (cfiRange && isReaderCfiRange(cfiRange)) attempts.push({ kind: "cfi-range", cfiRange });

  const prefix = trimOptional(row.preQuoteText);
  const suffix = trimOptional(row.postQuoteText);
  if (text && (prefix || suffix)) {
    attempts.push({
      kind: "quote-text",
      exact: text,
      prefix,
      suffix,
    });
  }

  if (text) attempts.push({ kind: "text-search", text });
  return attempts;
}

export function getNextReaderImportAttempt(row: ReaderImportRow): { attempt: ReaderImportAttempt; cursor: number; resultCursor: number } | null {
  if (row.status === "accepted" || row.status === "skipped" || row.status === "searching") return null;
  const attempts = buildReaderImportAttemptQueue(row);
  if (attempts.length === 0) return null;
  const state = normalizeReaderImportAttemptCursor(row, attempts.length);
  const attempt = attempts[state.cursor];
  return attempt ? { attempt, cursor: state.cursor, resultCursor: state.resultCursor } : null;
}

export function normalizeReaderImportAttemptCursor(
  row: ReaderImportRow,
  attemptCount: number,
): ReaderImportAttemptCursor {
  const cursor = Math.max(0, row.attemptCursor ?? 0);
  const resultCursor = Math.max(0, row.resultCursor ?? 0);
  const canRestart = row.status === "pending" || row.status === "not-found" || Boolean(row.hasMatched);
  if (attemptCount > 0 && cursor >= attemptCount && canRestart) {
    return { cursor: 0, resultCursor: 0, normalized: true };
  }
  return { cursor, resultCursor, normalized: false };
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
