import type { ReaderSearchResult } from "../domain/types";
import { debugReaderImport, isReaderImportDebugVerbose, previewImportText } from "./ReaderImportDebug.Diagnostics";

export type ReaderImportQuoteContextHint = {
  prefix?: string;
  suffix?: string;
};

export type ReaderImportQuoteContextScore = {
  score: number;
  prefixScore: number;
  suffixScore: number;
};

export function normalizeImportQuoteContextText(value: string | undefined): string {
  return (value ?? "")
    .replace(/\u2026/g, "...")
    .replace(/(?:\.\s*){3,}/g, "...")
    .replace(/\.{3}(?=\S)/g, "... ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .replace(/\s+([)\]}])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function scoreImportQuoteContextCandidate(
  result: Pick<ReaderSearchResult, "quotePrefix" | "quoteSuffix">,
  hint: ReaderImportQuoteContextHint,
): ReaderImportQuoteContextScore {
  const expectedPrefix = normalizeImportQuoteContextText(hint.prefix);
  const expectedSuffix = normalizeImportQuoteContextText(hint.suffix);
  const actualPrefix = normalizeImportQuoteContextText(result.quotePrefix);
  const actualSuffix = normalizeImportQuoteContextText(result.quoteSuffix);
  const prefixScore = expectedPrefix
    ? Math.max(
        scorePrefixMatch(actualPrefix, expectedPrefix),
        scorePrefixMatch(toPunctuationLightContext(actualPrefix), toPunctuationLightContext(expectedPrefix)),
      )
    : 0;
  const suffixScore = expectedSuffix
    ? Math.max(
        scoreSuffixMatch(actualSuffix, expectedSuffix),
        scoreSuffixMatch(toPunctuationLightContext(actualSuffix), toPunctuationLightContext(expectedSuffix)),
      )
    : 0;
  return { score: prefixScore + suffixScore, prefixScore, suffixScore };
}

function toPunctuationLightContext(value: string): string {
  return value
    .replace(/["'\u2018\u2019\u201c\u201d]/g, "")
    .replace(/[,;:.?!]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function rankImportQuoteContextCandidates<T extends ReaderSearchResult>(
  results: T[],
  hint: ReaderImportQuoteContextHint,
): T[] {
  const verbose = isReaderImportDebugVerbose();
  const scored = results
    .map((result, index) => ({ result, index, score: scoreImportQuoteContextCandidate(result, hint) }));
  debugReaderImport("quote-context candidate scores", {
    hint: {
      prefixPreview: verbose ? previewImportText(normalizeImportQuoteContextText(hint.prefix)) : undefined,
      suffixPreview: verbose ? previewImportText(normalizeImportQuoteContextText(hint.suffix)) : undefined,
    },
    candidates: scored.map((item) => ({
      index: item.index,
      cfi: item.result.cfi,
      score: item.score.score,
      prefixScore: item.score.prefixScore,
      suffixScore: item.score.suffixScore,
      quotePrefixPreview: verbose ? previewImportText(normalizeImportQuoteContextText(item.result.quotePrefix)) : undefined,
      quoteSuffixPreview: verbose ? previewImportText(normalizeImportQuoteContextText(item.result.quoteSuffix)) : undefined,
    })),
  });
  return scored
    .map((item) => ({ result: item.result, index: item.index, score: item.score.score }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.result);
}

function scorePrefixMatch(actualPrefix: string, expectedPrefix: string): number {
  if (!actualPrefix || !expectedPrefix) return 0;
  if (actualPrefix.endsWith(expectedPrefix)) return expectedPrefix.length * 2;
  if (actualPrefix.includes(expectedPrefix)) return expectedPrefix.length;
  return longestBoundaryOverlap(actualPrefix, expectedPrefix);
}

function scoreSuffixMatch(actualSuffix: string, expectedSuffix: string): number {
  if (!actualSuffix || !expectedSuffix) return 0;
  if (actualSuffix.startsWith(expectedSuffix)) return expectedSuffix.length * 2;
  if (actualSuffix.includes(expectedSuffix)) return expectedSuffix.length;
  return longestBoundaryOverlap(expectedSuffix, actualSuffix);
}

function longestBoundaryOverlap(left: string, right: string): number {
  const max = Math.min(left.length, right.length);
  for (let length = max; length >= 8; length -= 1) {
    if (left.slice(-length) === right.slice(0, length)) return length;
  }
  return 0;
}
