import type { ReaderImportRow } from "./readerImportTypes";

export type ReaderImportAttempt =
  | { kind: "selector-cfi"; cfi: string }
  | { kind: "quote-text"; exact: string; prefix?: string; suffix?: string }
  | { kind: "text-search"; text: string };

export function buildReaderImportAttemptQueue(row: ReaderImportRow): ReaderImportAttempt[] {
  if (row.kind !== "highlight") return [];

  const attempts: ReaderImportAttempt[] = [];
  const text = row.quoteText?.trim() ?? "";
  const cfi = row.cfiHint?.trim();
  if (cfi && text) attempts.push({ kind: "selector-cfi", cfi });

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

export function getNextReaderImportAttempt(row: ReaderImportRow): { attempt: ReaderImportAttempt; cursor: number; nextCursor: number } | null {
  if (row.status === "accepted" || row.status === "skipped" || row.status === "searching") return null;
  const attempts = buildReaderImportAttemptQueue(row);
  const cursor = Math.max(0, row.attemptCursor ?? 0);
  const attempt = attempts[cursor];
  return attempt ? { attempt, cursor, nextCursor: cursor + 1 } : null;
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
