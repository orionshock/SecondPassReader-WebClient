import { describe, expect, it } from "vitest";

import { buildImportSearchQueries } from "../features/reader/imports/readerImportSearchQueries";

describe("reader import fragment search queries", () => {
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
