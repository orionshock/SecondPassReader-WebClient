import { describe, expect, it } from "vitest";

import {
  normalizeImportQuoteContextText,
  rankImportQuoteContextCandidates,
  scoreImportQuoteContextCandidate,
} from "../features/reader/imports/ReaderImportQuoteContext.Policy";
import type { ReaderSearchResult } from "../features/reader/domain/ReaderDomain.Types";

describe("reader import quote context", () => {
  it("scores an exact quote candidate with matching prefix", () => {
    expect(
      scoreImportQuoteContextCandidate(
        result({ quotePrefix: "before the selected phrase" }),
        { prefix: "the selected phrase" },
      ).score,
    ).toBeGreaterThan(0);
  });

  it("scores an exact quote candidate with matching suffix", () => {
    expect(
      scoreImportQuoteContextCandidate(
        result({ quoteSuffix: "after the selected phrase" }),
        { suffix: "after the selected" },
      ).score,
    ).toBeGreaterThan(0);
  });

  it("uses context to rank repeated quote candidates", () => {
    const ranked = rankImportQuoteContextCandidates(
      [
        result({ id: "wrong", quotePrefix: "unrelated passage", quoteSuffix: "wrong continuation" }),
        result({ id: "right", quotePrefix: "matching prefix text", quoteSuffix: "matching suffix text" }),
      ],
      { prefix: "prefix text", suffix: "matching suffix" },
    );

    expect(ranked.map((item) => item.id)).toEqual(["right"]);
  });

  it("normalizes whitespace and punctuation spacing", () => {
    expect(normalizeImportQuoteContextText("  Hello   ,\nworld  ! ")).toBe("hello, world!");
  });

  it("normalizes spaced ellipsis", () => {
    expect(normalizeImportQuoteContextText("wait . . . what")).toBe("wait... what");
  });
});

function result(overrides: Partial<ReaderSearchResult>): ReaderSearchResult {
  return {
    id: "result",
    cfi: "epubcfi(/6/2)",
    excerpt: "excerpt",
    ...overrides,
  };
}
