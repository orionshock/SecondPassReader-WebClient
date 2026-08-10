import { describe, expect, it } from "vitest";

import {
  buildImportSearchQueries,
  buildImportSearchQueryPlans,
} from "../features/reader/imports/ReaderImportSearchPlan.Queries";

describe("reader import fragment search queries", () => {
  it("generates punctuation-light fragments at quote and comma boundaries", () => {
    const quote = "\u201cIt is too late to save them,\u201d Doroga rumbled. \u201cThis is how it begins.\u201d";
    const queries = buildImportSearchQueries(quote);

    expect(queries[0]).toBe(quote);
    expect(queries).toContain("It is too late to save them");
    expect(queries).toContain("Doroga rumbled");
    expect(queries).toContain("This is how it begins");
    expect(queries).not.toEqual([
      quote,
      "\u201cIt is too late to save them,\u201d Doroga rumbled.",
      "It is too late to save them,\u201d Doroga rumbled",
      "\u201cThis is how it begins.\u201d",
      "This is how it begins",
    ]);
    expect(queries.length).toBeLessThanOrEqual(12);
  });

  it("retains surrounding quote context for punctuation-light fragments", () => {
    const quote = "\u201cIt is too late to save them,\u201d Doroga rumbled. \u201cThis is how it begins.\u201d";
    const plan = buildImportSearchQueryPlans(quote).find((candidate) => candidate.query === "Doroga rumbled");

    expect(plan).toMatchObject({
      repairText: "\u201cIt is too late to save them,\u201d Doroga rumbled.",
      prefix: "\u201cIt is too late to save them,\u201d",
      suffix: ". \u201cThis is how it begins.\u201d",
    });
  });

  it("preserves apostrophes inside words and hyphenated words", () => {
    const queries = buildImportSearchQueries(
      "\u201cI didn\u2019t think you\u2019re battle-ready,\u201d Tavi replied.",
    );
    const straightApostropheQueries = buildImportSearchQueries(
      '"I didn\'t think you\'re battle-ready," Tavi replied.',
    );

    expect(queries).toContain("I didn\u2019t think you\u2019re battle-ready");
    expect(queries).toContain("Tavi replied");
    expect(straightApostropheQueries).toContain("I didn't think you're battle-ready");
  });

  it("generates sentence fragments across quoted paragraph boundaries", () => {
    const quote = "A clear line of succession might lay many of these worries to rest.\u201d "
      + "Gaius nodded. \u201cI am addressing it. I will say no more than that.\u201d";
    const queries = buildImportSearchQueries(quote);

    expect(queries).toContain("A clear line of succession might lay many of these worries to rest");
    expect(queries).toContain("Gaius nodded");
    expect(queries).toContain("I am addressing it");
    expect(queries).toContain("I will say no more than that");
    expect(queries).not.toEqual([quote]);
    expect(queries.length).toBeLessThanOrEqual(12);
  });

  it("generates a useful anchor fragment for a cross-paragraph quote", () => {
    const queries = buildImportSearchQueries("I blinked. Was Marcone . . . talking smack?");

    expect(queries).toContain("Was Marcone ... talking smack?");
  });

  it("normalizes spaced ellipsis consistently", () => {
    expect(buildImportSearchQueries("Was Marcone . . . talking smack?")[0]).toBe("Was Marcone ... talking smack?");
  });

  it("includes NBSP ellipsis variants for literal EPUB search", () => {
    expect(buildImportSearchQueries("Was Marcone . . . talking smack?")).toContain("Was Marcone\u00a0.\u00a0.\u00a0. talking smack?");
  });
});
