import type { ReaderSearchBookHandle } from "../shell/types";
import type { ReaderSearchResult } from "../domain/types";
import type { ReaderImportRow } from "./readerImportTypes";
import type { ReaderImportAttempt } from "./readerImportAttempts";
import { debugReaderImport, isReaderImportDebugVerbose, previewImportText } from "./readerImportDebug";
import { rankImportQuoteContextCandidates } from "./readerImportQuoteContext";
import { buildImportSearchQueryPlans } from "./readerImportSearchQueries";
import { debugReaderRangeRepairDiagnostic } from "./ReaderRangeRepairDebug.Adapter";

type ReaderImportSearchAttempt = Extract<ReaderImportAttempt, { kind: "quote-text" | "text-search" }>;

const IMPORT_FRAGMENT_CANDIDATE_LIMIT = 25;

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
  const verbose = isReaderImportDebugVerbose();
  if (attempt.kind === "quote-text") {
    const query = attempt.exact.trim();
    if (!query) return [];
    debugReaderImport("quote-context search start", {
      rowId: row.id,
      queryPreview: verbose ? previewImportText(query) : undefined,
      prefixPreview: verbose ? previewImportText(attempt.prefix) : undefined,
      suffixPreview: verbose ? previewImportText(attempt.suffix) : undefined,
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
      queryPreview: verbose ? previewImportText(query) : undefined,
      rawCount: results.length,
      rankedCount: ranked.length,
      raw: results.map((result) => summarizeSearchResult(result, verbose)),
      ranked: ranked.map((result) => summarizeSearchResult(result, verbose)),
    });
    return ranked
      .filter((result) => Boolean(result.cfi?.trim()))
      .map((result) => ({ result, matchedText: result.repairedText ?? query, query }));
  }

  const queryPlans = buildImportSearchQueryPlans(attempt.text);
  debugReaderImport("text search queries", {
    rowId: row.id,
    queryCount: queryPlans.length,
    fragmentPreviews: verbose ? queryPlans.slice(1, 6).map((plan) => previewImportText(plan.query)) : undefined,
  });
  const matches: ReaderImportSearchMatch[] = [];
  const seen = new Set<string>();
  for (const plan of queryPlans) {
    if (signal.aborted) return [];
    const results = await searchBook(plan.query, {
      // Short fallback fragments can occur many times before the intended match.
      // Collect enough raw candidates for range repair/context ranking to inspect
      // later occurrences; only eligible matches are returned to activation.
      maxResults: IMPORT_FRAGMENT_CANDIDATE_LIMIT,
      maxSeqEle: 8,
      repairFullText: plan.repairText,
      signal,
      onRangeRepairDiagnostic: debugReaderRangeRepairDiagnostic,
    });
    if (signal.aborted) return [];
    const rankedResults = rankFragmentSearchResults(results, plan);
    debugReaderImport("text search query results", {
      rowId: row.id,
      queryPreview: verbose ? previewImportText(plan.query) : undefined,
      hasRepairFullText: Boolean(plan.repairText),
      count: results.length,
      eligibleCount: rankedResults.length,
      results: rankedResults.map((result) => summarizeSearchResult(result, verbose)),
    });
    for (const result of rankedResults) {
      const key = result.cfi?.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      matches.push({ result, matchedText: result.repairedText ?? plan.query, query: plan.query });
    }
  }
  return matches;
}

function rankFragmentSearchResults(
  results: ReaderSearchResult[],
  hint: { prefix?: string; suffix?: string },
): ReaderSearchResult[] {
  if (results.length === 0) return results;
  const repaired = results.filter((result) => Boolean(result.repairedText));
  const unrepaired = results.filter((result) => !result.repairedText);
  if (!hint.prefix && !hint.suffix) return [...repaired, ...unrepaired];
  const ranked = rankImportQuoteContextCandidates(unrepaired, hint);
  return [...repaired, ...ranked];
}

function summarizeSearchResult(result: ReaderSearchResult, verbose: boolean): Record<string, unknown> {
  return {
    id: result.id,
    cfi: result.cfi,
    excerptPreview: verbose ? previewImportText(result.excerpt) : undefined,
    repairedPreview: verbose ? previewImportText(result.repairedText) : undefined,
    hasQuotePrefix: Boolean(result.quotePrefix),
    hasQuoteSuffix: Boolean(result.quoteSuffix),
    sectionLabel: result.sectionLabel,
  };
}
