import { describe, expect, it } from "vitest";

import { buildImportSearchQueries } from "../features/reader/imports/readerImportSearch";

describe("reader import fragment search queries", () => {
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
