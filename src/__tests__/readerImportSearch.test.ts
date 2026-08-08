import { describe, expect, it } from "vitest";

import { findImportRowSearchMatch, findImportRowSearchMatches } from "../features/reader/imports/readerImportSearch";
import type { ReaderSearchBookHandle } from "../features/reader/shell/types";
import type { ReaderSearchResult } from "../features/reader/domain/types";
import type { ReaderImportRow } from "../features/reader/imports/readerImportTypes";

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

  it("collects matches from multiple sentence fragments for candidate cycling", async () => {
    const quote = "First useful sentence is long enough. Second useful sentence is also long enough.";
    const searchBook: ReaderSearchBookHandle = async (query) => {
      if (query === "First useful sentence is long enough") return [result({ id: "first", cfi: "first-cfi" })];
      if (query === "Second useful sentence is also long enough") return [result({ id: "second", cfi: "second-cfi" })];
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
