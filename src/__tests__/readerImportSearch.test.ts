import { describe, expect, it } from "vitest";

import { findImportRowSearchMatch, findImportRowSearchMatches, findImportRowSearchMatchesByAttempt } from "../features/reader/imports/ReaderImportSearch.Queries";
import type { ReaderSearchBookHandle } from "../features/reader/domain/ReaderBridge.Types";
import type { ReaderSearchResult } from "../features/reader/domain/ReaderDomain.Types";
import type { ReaderImportRow } from "../features/reader/imports/ReaderImport.Types";
import { importProse } from "./ReaderImportTest.Fixtures";

describe("reader import search", () => {
  it("ranks quote-context candidates before returning a match", async () => {
    const searchBook: ReaderSearchBookHandle = async () => [
      result({ id: "wrong", cfi: "wrong", quotePrefix: "elsewhere", quoteSuffix: "wrong suffix" }),
      result({ id: "right", cfi: "right", quotePrefix: "matching prefix", quoteSuffix: "matching suffix" }),
    ];

    const match = await findImportRowSearchMatch({
      row: row({ quoteText: "same quote", preQuoteText: "prefix", postQuoteText: "matching suffix" }),
      attempt: { kind: "quote-text", exact: "same quote", prefix: "prefix", suffix: "matching suffix" },
      searchBook,
      signal: new AbortController().signal,
    });

    expect(match?.result.id).toBe("right");
  });

  it("keeps text-only rows on the existing text search path", async () => {
    const calls: Array<{ query: string; repairFullText?: string }> = [];
    const searchBook: ReaderSearchBookHandle = async (query, options) => {
      calls.push({ query, repairFullText: options?.repairFullText });
      return [result({ cfi: "found" })];
    };

    const match = await findImportRowSearchMatch({
      row: row({ quoteText: "plain quote" }),
      attempt: { kind: "text-search", text: "plain quote" },
      searchBook,
      signal: new AbortController().signal,
    });

    expect(match?.result.cfi).toBe("found");
    expect(calls[0]).toEqual({ query: "plain quote", repairFullText: undefined });
  });

  it("passes the import range-repair diagnostic adapter to fragment searches", async () => {
    let hasDiagnosticHandler = false;
    const searchBook: ReaderSearchBookHandle = async (_query, options) => {
      hasDiagnosticHandler ||= typeof options?.onRangeRepairDiagnostic === "function";
      return [];
    };

    await findImportRowSearchMatches({
      row: row({ quoteText: "First useful sentence is long enough. Second useful sentence is also long enough." }),
      attempt: { kind: "text-search", text: "First useful sentence is long enough. Second useful sentence is also long enough." },
      searchBook,
      signal: new AbortController().signal,
    });

    expect(hasDiagnosticHandler).toBe(true);
  });

  it("searches import fallback attempts sequentially while preserving attempt result order", async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const calls: string[] = [];
    const searchBook: ReaderSearchBookHandle = async (query) => {
      calls.push(query);
      if (query === "first quote") await firstGate;
      return [result({ id: query, cfi: `${query}-cfi`, quotePrefix: "matching context" })];
    };
    const matches = findImportRowSearchMatchesByAttempt({
      row: row({ quoteText: "first quote" }),
      attempts: [
        { kind: "quote-text", exact: "first quote", prefix: "matching context" },
        { kind: "quote-text", exact: "second quote", prefix: "matching context" },
      ],
      searchBook,
      signal: new AbortController().signal,
    });

    await Promise.resolve();
    expect(calls).toEqual(["first quote"]);
    releaseFirst();
    const resultsByAttempt = await matches;

    expect(calls).toEqual(["first quote", "second quote"]);
    expect(resultsByAttempt.map((matchesForAttempt) => matchesForAttempt[0]?.result.id)).toEqual([
      "first quote",
      "second quote",
    ]);
  });

  it("collects matches from multiple sentence fragments for candidate cycling", async () => {
    const quote = "First useful sentence is long enough. Second useful sentence is also long enough.";
    const searchBook: ReaderSearchBookHandle = async (query) => {
      if (query === "First useful sentence is long enough") {
        return [result({ id: "first", cfi: "first-cfi", repairedText: "First useful sentence is long enough." })];
      }
      if (query === "Second useful sentence is also long enough") {
        return [result({ id: "second", cfi: "second-cfi", repairedText: "Second useful sentence is also long enough." })];
      }
      return [];
    };

    const matches = await findImportRowSearchMatches({
      row: row({ quoteText: quote }),
      attempt: { kind: "text-search", text: quote },
      searchBook,
      signal: new AbortController().signal,
    });

    expect(matches.map((match) => match.result.id)).toEqual(["first", "second"]);
  });

  it("ranks repeated punctuation-light fragment matches by imported quote context", async () => {
    const quote = importProse.dorogaQuote;
    const searchBook: ReaderSearchBookHandle = async (query) => query === importProse.dorogaFragment
      ? [
          result({ id: "wrong", cfi: "wrong-cfi", quotePrefix: "unrelated words", quoteSuffix: "another sentence" }),
          result({
            id: "right",
            cfi: "right-cfi",
            quotePrefix: "Earlier text: \"It is too late to save them,\"",
            quoteSuffix: ". \"This is how it begins.\" Later text.",
          }),
        ]
      : [];

    const matches = await findImportRowSearchMatches({
      row: row({ quoteText: quote }),
      attempt: { kind: "text-search", text: quote },
      searchBook,
      signal: new AbortController().signal,
    });

    expect(matches.map((match) => match.result.id)).toEqual(["right"]);
  });

  it("ranks successfully repaired fragment matches before generic occurrences", async () => {
    const quote = "\u201cIt is too late to save them,\u201d Doroga rumbled.";
    const searchBook: ReaderSearchBookHandle = async (query) => query === importProse.dorogaFragment
      ? [
          result({ id: "generic", cfi: "generic-cfi" }),
          result({ id: "repaired", cfi: "repaired-cfi", repairedText: '"It is too late to save them," Doroga rumbled' }),
        ]
      : [];

    const matches = await findImportRowSearchMatches({
      row: row({ quoteText: quote }),
      attempt: { kind: "text-search", text: quote },
      searchBook,
      signal: new AbortController().signal,
    });

    expect(matches.map((match) => match.result.id)).toEqual(["repaired"]);
  });

  it("rejects generic fragment occurrences without repair or surrounding context", async () => {
    const quote = importProse.dorogaQuote;
    const searchBook: ReaderSearchBookHandle = async (query) => query === importProse.dorogaFragment
      ? [
          result({ id: "prologue", cfi: "prologue-cfi", quotePrefix: "unrelated", quoteSuffix: "unrelated" }),
          result({ id: "chapter", cfi: "chapter-cfi", quotePrefix: "different prose", quoteSuffix: "different prose" }),
        ]
      : [];

    const matches = await findImportRowSearchMatches({
      row: row({ quoteText: quote }),
      attempt: { kind: "text-search", text: quote },
      searchBook,
      signal: new AbortController().signal,
    });

    expect(matches).toEqual([]);
  });

  it("searches beyond the first five generic fragment occurrences", async () => {
    const quote = importProse.dorogaQuote;
    const observedLimits: number[] = [];
    const searchBook: ReaderSearchBookHandle = async (query, options) => {
      if (query !== importProse.dorogaFragment) return [];
      observedLimits.push(options?.maxResults ?? 0);
      return [
        ...Array.from({ length: 5 }, (_, index) => result({
          id: `generic-${index}`,
          cfi: `generic-cfi-${index}`,
          quotePrefix: "unrelated",
          quoteSuffix: "unrelated",
        })),
        result({
          id: "intended",
          cfi: "intended-cfi",
          repairedText: '"It is too late to save them," Doroga rumbled.',
        }),
      ];
    };

    const matches = await findImportRowSearchMatches({
      row: row({ quoteText: quote }),
      attempt: { kind: "text-search", text: quote },
      searchBook,
      signal: new AbortController().signal,
    });

    expect(observedLimits).toEqual([25]);
    expect(matches.map((match) => match.result.id)).toEqual(["intended"]);
  });
});

function row(overrides: Partial<ReaderImportRow>): ReaderImportRow {
  return {
    id: "row",
    index: 1,
    kind: "highlight",
    status: "pending",
    ...overrides,
  };
}

function result(overrides: Partial<ReaderSearchResult>): ReaderSearchResult {
  return {
    id: "result",
    cfi: "epubcfi(/6/2)",
    excerpt: "excerpt",
    ...overrides,
  };
}
