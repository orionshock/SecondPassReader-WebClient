import type { ReaderSearchBookHandle } from "../shell/types";
import type { ReaderSearchResult } from "../domain/types";
import type { ReaderImportRow } from "./readerImportTypes";

export type ReaderImportSearchMatch = {
  result: ReaderSearchResult;
  matchedText: string;
  query: string;
};

export async function findImportRowSearchMatch({
  row,
  searchBook,
  signal,
}: {
  row: ReaderImportRow;
  searchBook: ReaderSearchBookHandle;
  signal: AbortSignal;
}): Promise<ReaderImportSearchMatch | null> {
  const queries = buildImportSearchQueries(row.importedText);
  const fullQuery = queries[0] ?? "";
  for (const query of queries) {
    if (signal.aborted) return null;
    const results = await searchBook(query, {
      maxResults: 5,
      maxSeqEle: 8,
      repairFullText: query === fullQuery ? undefined : row.importedText,
      signal,
    });
    if (signal.aborted) return null;
    const result = results[0];
    if (result?.cfi?.trim()) return { result, matchedText: result.repairedText ?? query, query };
  }
  return null;
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
