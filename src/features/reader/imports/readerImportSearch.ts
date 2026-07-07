import type { ReaderSearchBookHandle } from "../shell/types";
import type { ReaderSearchResult } from "../domain/types";
import type { ReaderImportRow } from "./readerImportTypes";
import type { ReaderImportAttempt } from "./readerImportAttempts";
import { debugReaderImport, previewImportText } from "./readerImportDebug";
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
    debugReaderImport("quote-context search start", {
      rowId: row.id,
      queryPreview: previewImportText(query),
      prefixPreview: previewImportText(attempt.prefix),
      suffixPreview: previewImportText(attempt.suffix),
    });
    const results = await searchBook(query, {
      maxResults: 25,
      maxSeqEle: 8,
      signal,
    });
    if (signal.aborted) return [];
    const ranked = rankImportQuoteContextCandidates(results, { prefix: attempt.prefix, suffix: attempt.suffix });
    debugReaderImport("quote-context search results", {
      rowId: row.id,
      queryPreview: previewImportText(query),
      rawCount: results.length,
      rankedCount: ranked.length,
      raw: results.map((result) => summarizeSearchResult(result)),
      ranked: ranked.map((result) => summarizeSearchResult(result)),
    });
    return ranked
      .filter((result) => Boolean(result.cfi?.trim()))
      .map((result) => ({ result, matchedText: result.repairedText ?? query, query }));
  }

  const queries = buildImportSearchQueries(attempt.text);
  debugReaderImport("text search queries", {
    rowId: row.id,
    quotePreview: previewImportText(row.quoteText),
    queryCount: queries.length,
    queries: queries.map((query) => previewImportText(query)),
  });
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
    debugReaderImport("text search query results", {
      rowId: row.id,
      queryPreview: previewImportText(query),
      hasRepairFullText: query !== fullQuery && Boolean(row.quoteText),
      count: results.length,
      results: results.map((result) => summarizeSearchResult(result)),
    });
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
  const sentences = splitSearchSentences(normalized);
  const fragments = [
    words.slice(0, 18).join(" "),
    words.slice(Math.max(0, Math.floor((words.length - 18) / 2)), Math.max(0, Math.floor((words.length - 18) / 2)) + 18).join(" "),
    words.slice(Math.max(0, words.length - 18)).join(" "),
    ...sentences.sort((a, b) => b.length - a.length),
  ];

  for (const fragment of fragments) {
    const q = normalizeSearchText(fragment);
    if (isUsefulFragment(q) && !out.includes(q)) out.push(q);
  }
  for (const query of [...out]) {
    const spacedEllipsis = query.replace(/\.{3}/g, ". . .");
    if (spacedEllipsis !== query && !out.includes(spacedEllipsis)) out.push(spacedEllipsis);
  }
  for (const query of [...out]) {
    const nbspEllipsis = query.replace(/ \. \. \./g, "\u00a0.\u00a0.\u00a0.");
    if (nbspEllipsis !== query && !out.includes(nbspEllipsis)) out.push(nbspEllipsis);
  }
  return out;
}

function summarizeSearchResult(result: ReaderSearchResult): Record<string, unknown> {
  return {
    id: result.id,
    cfi: result.cfi,
    excerptPreview: previewImportText(result.excerpt),
    repairedPreview: previewImportText(result.repairedText),
    hasQuotePrefix: Boolean(result.quotePrefix),
    hasQuoteSuffix: Boolean(result.quoteSuffix),
    sectionLabel: result.sectionLabel,
  };
}

function normalizeSearchText(text: string): string {
  return text
    .replace(/\u2026/g, "...")
    .replace(/(?:\.\s*){3,}/g, "...")
    .replace(/\.{3}(?=\S)/g, "... ")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulFragment(text: string): boolean {
  const words = text.split(" ").filter((word) => /[a-z0-9]/i.test(word));
  return (text.length >= 24 && words.length >= 6) || (text.length >= 16 && words.length >= 3 && /[.!?]$/.test(text));
}

function splitSearchSentences(text: string): string[] {
  const protectedText = text.replace(/\.{3}/g, "<ellipsis>");
  return protectedText
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeSearchText(sentence.replace(/<ellipsis>/g, "...")))
    .filter(Boolean);
}
