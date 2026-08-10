import { describe, expect, it } from "vitest";

import {
  describeCfiBestEffort,
  getCfiDescriptionCandidates,
  toReaderCfiLocationDisplay,
} from "../features/reader/session/ReadingSessionCfiDescriptions.Queries";
import type { ReaderTocItem } from "../features/reader/domain/types";

describe("readerCfiDescriptions", () => {
  const toc: ReaderTocItem[] = [
    { id: "title", label: "Sample Book", href: "text/title.xhtml" },
    { id: "ch1", label: "Chapter 1 - Sample Book", href: "text/part0001.xhtml" },
    { id: "ch7", label: "Chapter 7", href: "text/part0007.html" },
  ];

  it("returns range CFI and range-start fallback candidates", () => {
    expect(getCfiDescriptionCandidates("epubcfi(/6/14!/4/2,/2/4,/2/10)")).toEqual([
      "epubcfi(/6/14!/4/2,/2/4,/2/10)",
      "epubcfi(/6/14!/4/2/2/4)",
    ]);
  });

  it("handles malformed CFI candidates without throwing", () => {
    expect(getCfiDescriptionCandidates("not-a-cfi")).toEqual(["not-a-cfi"]);
    expect(getCfiDescriptionCandidates("   ")).toEqual([]);
  });

  it("uses range-start fallback when the full range has no href", async () => {
    const calls: string[] = [];
    const result = await describeCfiBestEffort(async (cfi) => {
      calls.push(cfi);
      if (cfi.includes(",")) return { cfi };
      return { cfi, href: "text/part0007_split_001.html", bookProgress: 0.42 };
    }, "epubcfi(/6/14!/4/2,/2/4,/2/10)");

    expect(calls).toEqual(["epubcfi(/6/14!/4/2,/2/4,/2/10)", "epubcfi(/6/14!/4/2/2/4)"]);
    expect(result).toEqual({
      cfi: "epubcfi(/6/14!/4/2,/2/4,/2/10)",
      href: "text/part0007_split_001.html",
      bookProgress: 0.42,
    });
  });

  it("formats label and percent parts from derived CFI description metadata", () => {
    const display = toReaderCfiLocationDisplay({
      description: { cfi: "epubcfi(/6/14)", href: "text/part0007_split_001.html", bookProgress: 0.421 },
      toc,
      bookTitle: "Sample Book",
    });

    expect(display.locationLabel).toBe("Chapter 7");
    expect(display.progressText).toBe("42%");
    expect(display.labelParts).toEqual(["Chapter 7", "42%"]);
    expect(display.label).toBe("Chapter 7 42%");
  });

  it("formats percent-only metadata when no TOC label matches", () => {
    const display = toReaderCfiLocationDisplay({
      description: { cfi: "epubcfi(/6/14)", bookProgress: 0.08 },
      toc,
      bookTitle: "Sample Book",
    });

    expect(display.locationLabel).toBeUndefined();
    expect(display.progressText).toBe("8%");
    expect(display.labelParts).toEqual(["8%"]);
    expect(display.label).toBe("8%");
  });

  it("falls back to Saved location when no display metadata is available", () => {
    const display = toReaderCfiLocationDisplay({
      description: { cfi: "epubcfi(/6/14)" },
      toc,
      bookTitle: "Sample Book",
    });

    expect(display.locationLabel).toBeUndefined();
    expect(display.progressText).toBeUndefined();
    expect(display.labelParts).toEqual([]);
    expect(display.label).toBe("Saved location");
  });

  it("does not read annotation-style href, spine, or chapter fields as display metadata", () => {
    const display = toReaderCfiLocationDisplay({
      description: {
        cfi: "epubcfi(/6/14)",
        spine: "text/part0007.xhtml",
        chapter: "Chapter 7",
        chapterLabel: "Chapter 7",
      } as any,
      toc,
      bookTitle: "Sample Book",
    });

    expect(display.locationLabel).toBeUndefined();
    expect(display.label).toBe("Saved location");
  });
});
