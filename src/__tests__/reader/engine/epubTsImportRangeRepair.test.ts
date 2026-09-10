import { afterEach, describe, expect, it, vi } from "vitest";

import { findPunctuationTolerantRepairRange } from "../../../features/reader/engine/EpubImportRangeRepair.Policy";
import { repairImportedHighlightRangeInSection } from "../../../features/reader/engine/EpubTsImportRangeRepair.Engine";
import type { ReaderRangeRepairDiagnostic } from "../../../features/reader/domain/ReaderRangeRepair.Diagnostics";

describe("EPUB import range repair matching", () => {
  afterEach(() => vi.unstubAllGlobals());

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

  it("emits start and success diagnostics through the optional callback", () => {
    const diagnostics: ReaderRangeRepairDiagnostic[] = [];
    const repaired = repairImportedHighlightRangeInSection({
      section: repairableSection("Before complete imported highlight after"),
      anchorCfi: "not-a-cfi",
      fragmentText: "imported highlight",
      fullText: "complete imported highlight",
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(repaired).toEqual({
      cfiRange: "epubcfi(/6/2!/4/2,/1:7,/1:34)",
      matchedText: "complete imported highlight",
    });
    expect(diagnostics.map((diagnostic) => diagnostic.event)).toContain("range repair start");
    expect(diagnostics.map((diagnostic) => diagnostic.event)).toContain("range repair success");
  });

  it("emits failure diagnostics and still works without a callback", () => {
    const diagnostics: ReaderRangeRepairDiagnostic[] = [];
    const input = {
      section: repairableSection("Before imported highlight after"),
      anchorCfi: "not-a-cfi",
      fragmentText: "imported highlight",
      fullText: "different full highlight text",
    };

    expect(repairImportedHighlightRangeInSection({
      ...input,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    })).toBeNull();
    expect(diagnostics).toContainEqual(expect.objectContaining({
      event: "range repair failed",
      data: expect.objectContaining({ reason: "full text not found near fragment" }),
    }));
    expect(repairImportedHighlightRangeInSection(input)).toBeNull();
  });
});

function repairableSection(text: string) {
  const textNode = { data: text } as Text;
  const document = {
    body: {},
    documentElement: {},
    createTreeWalker: () => {
      let consumed = false;
      return {
        nextNode: () => {
          if (consumed) return null;
          consumed = true;
          return textNode;
        },
      };
    },
    createRange: () => ({
      setStart: vi.fn(),
      setEnd: vi.fn(),
    }),
  } as unknown as Document;
  vi.stubGlobal("NodeFilter", { SHOW_TEXT: 4 });
  return {
    document,
    cfiFromRange: () => "epubcfi(/6/2!/4/2,/1:7,/1:34)",
  };
}
