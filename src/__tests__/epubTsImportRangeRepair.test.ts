import { describe, expect, it } from "vitest";

import { findPunctuationTolerantRepairRange } from "../features/reader/engine/EpubTsImportRangeRepair";

describe("EPUB import range repair matching", () => {
  it("maps punctuation-different source text back to actual EPUB offsets", () => {
    const value = 'Before "It is too late to save them," Doroga rumbled. After';
    const expected = "\u201cIt is too late to save them,\u201d Doroga rumbled.";
    const range = findPunctuationTolerantRepairRange(value, expected);

    expect(range).not.toBeNull();
    expect(value.slice(range!.start, range!.end)).toBe('"It is too late to save them," Doroga rumbled.');
  });

  it("tolerates straight and curly apostrophe differences", () => {
    const value = "Before I didn't think you're ready. After";
    const expected = "I didn\u2019t think you\u2019re ready.";
    const range = findPunctuationTolerantRepairRange(value, expected);

    expect(range).not.toBeNull();
    expect(value.slice(range!.start, range!.end)).toBe("I didn't think you're ready.");
  });

  it("does not repair unrelated prose", () => {
    expect(findPunctuationTolerantRepairRange("Doroga rumbled elsewhere", "This is unrelated text.")).toBeNull();
  });
});
