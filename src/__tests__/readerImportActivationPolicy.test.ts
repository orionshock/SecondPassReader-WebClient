import { describe, expect, it } from "vitest";

import { getReaderImportActivationEligibility } from "../features/reader/imports/readerImportActivationPolicy";
import type { ReaderImportRow } from "../features/reader/imports/readerImportTypes";

describe("reader import activation policy", () => {
  it("allows highlight rows with text to use quote search", () => {
    expect(getReaderImportActivationEligibility(row({ kind: "highlight", importedText: "Selected text" }))).toEqual({
      kind: "text-search",
    });
  });

  it("keeps bookmark rows out of quote search", () => {
    expect(
      getReaderImportActivationEligibility(
        row({
          kind: "bookmark",
          importedText: "Bookmark",
          selectorHint: { kind: "epub_cfi", value: "epubcfi(/6/2)" },
        }),
      ),
    ).toEqual({ kind: "bookmark-location" });
  });

  it("handles empty highlight text without searching", () => {
    expect(getReaderImportActivationEligibility(row({ kind: "highlight", importedText: "   " }))).toEqual({
      kind: "not-searchable",
      reason: "missing-text",
    });
  });
});

function row(overrides: Partial<ReaderImportRow>): ReaderImportRow {
  return {
    id: "row-1",
    kind: "highlight",
    index: 1,
    importedText: "Text",
    status: "pending",
    ...overrides,
  };
}
