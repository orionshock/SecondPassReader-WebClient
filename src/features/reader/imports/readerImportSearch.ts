import type { ReaderSearchBookHandle } from "../shell/types";
import type { ReaderSearchResult } from "../domain/types";
import type { ReaderImportRow } from "./readerImportTypes";
import type { ReaderImportAttempt } from "./readerImportAttempts";
import { rankImportQuoteContextCandidates } from "./readerImportQuoteContext";

type ReaderImportSearchAttempt = Extract<ReaderImportAttempt, { kind: "quote-text" | "text-search" }>;

export type ReaderImportSearchMatch = {
  result: ReaderSearchResult;
  matchedText: string;
  query: string;
};

export async function findImportRowSearchMatch({
  row,
  attempt,
  searchBook,
  signal,
}: {
  row: ReaderImportRow;
  attempt: ReaderImportSearchAttempt;
  searchBook: ReaderSearchBookHandle;
  signal: AbortSignal;
}): Promise<ReaderImportSearchMatch | null> {
  const matches = await findImportRowSearchMatches({ row, attempt, searchBook, signal });
  return matches[0] ?? null;
}

export async function findImportRowSearchMatches({
  row,
  attempt,
  searchBook,
  signal,
}: {
  row: ReaderImportRow;
  attempt: ReaderImportSearchAttempt;
  searchBook: ReaderSearchBookHandle;
  signal: AbortSignal;
}): Promise<ReaderImportSearchMatch[]> {
  if (attempt.kind === "quote-text") {
    const query = attempt.exact.trim();
    if (!query) return [];
    const results = await searchBook(query, {
      maxResults: 25,
      maxSeqEle: 8,
      signal,
    });
    if (signal.aborted) return [];
    return rankImportQuoteContextCandidates(results, { prefix: attempt.prefix, suffix: attempt.suffix })
      .filter((result) => Boolean(result.cfi?.trim()))
      .map((result) => ({ result, matchedText: result.repairedText ?? query, query }));
  }

  const queries = buildImportSearchQueries(attempt.text);
  const fullQuery = queries[0] ?? "";
  const matches: ReaderImportSearchMatch[] = [];
  const seen = new Set<string>();
  for (const query of queries) {
    if (signal.aborted) return [];
    const results = await searchBook(query, {
      maxResults: 5,
      maxSeqEle: 8,
      repairFullText: query === fullQuery ? undefined : row.quoteText,
      signal,
    });
    if (signal.aborted) return [];
    for (const result of results) {
      const key = result.cfi?.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      matches.push({ result, matchedText: result.repairedText ?? query, query });
    }
    if (matches.length > 0) return matches;
  }
  return matches;
}

export function buildImportSearchQueries(text: string): string[] {
  const normalized = normalizeSearchText(text);
  if (!normalized) return [];
  const out = [normalized];
  const words = normalized.split(" ").filter(Boolean);
  const fragments = [
    words.slice(0, 18).join(" "),
    words.slice(Math.max(0, Math.floor((words.length - 18) / 2)), Math.max(0, Math.floor((words.length - 18) / 2)) + 18).join(" "),
    words.slice(Math.max(0, words.length - 18)).join(" "),
    longestSentence(normalized),
  ];

  for (const fragment of fragments) {
    const q = normalizeSearchText(fragment);
    if (isUsefulFragment(q) && !out.includes(q)) out.push(q);
  }
  return out;
}

function normalizeSearchText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isUsefulFragment(text: string): boolean {
  const words = text.split(" ").filter((word) => /[a-z0-9]/i.test(word));
  return text.length >= 24 && words.length >= 6;
}

function longestSentence(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  return sentences.sort((a, b) => b.length - a.length)[0] ?? "";
}
