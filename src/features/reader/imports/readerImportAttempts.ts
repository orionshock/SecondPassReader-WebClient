import type { ReaderImportRow } from "./readerImportTypes";

export type ReaderImportAttempt =
  | { kind: "quote-text"; exact: string; prefix?: string; suffix?: string }
  | { kind: "text-search"; text: string };

export function buildReaderImportAttemptQueue(row: ReaderImportRow): ReaderImportAttempt[] {
  if (row.kind !== "highlight") return [];

  const attempts: ReaderImportAttempt[] = [];
  const text = row.quoteText?.trim() ?? "";

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
  const rawCursor = Math.max(0, row.attemptCursor ?? 0);
  const cursor = rawCursor >= attempts.length && row.hasMatched ? 0 : rawCursor;
  const attempt = attempts[cursor];
  return attempt ? { attempt, cursor, resultCursor: Math.max(0, row.resultCursor ?? 0) } : null;
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
