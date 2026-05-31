import { describe, expect, it } from "vitest";

import type { ReadingAnnotation } from "@secondpass/client";
import { getAnnotationCfi, isBookmarkAnnotation, toReaderBookmark } from "../features/reader/annotations/bookmarkUtils";

describe("reader bookmark utils", () => {
  it("detects bookmarking motivation (string)", () => {
    const a = { id: "1", motivation: "bookmarking" } as unknown as ReadingAnnotation;
    expect(isBookmarkAnnotation(a)).toBe(true);
  });

  it("detects bookmarking motivation (array)", () => {
    const a = { id: "1", motivation: ["highlighting", "bookmarking"] } as unknown as ReadingAnnotation;
    expect(isBookmarkAnnotation(a)).toBe(true);
  });

  it("extracts CFI from single FragmentSelector", () => {
    const a = {
      id: "1",
      motivation: "bookmarking",
      target: { selector: { type: "FragmentSelector", conformsTo: "http://www.idpf.org/epub/linking/cfi/epub-cfi.html", value: "epubcfi(/6/2)" } },
    } as unknown as ReadingAnnotation;
    expect(getAnnotationCfi(a)).toBe("epubcfi(/6/2)");
  });

  it("extracts CFI from selector array (FragmentSelector + TextQuoteSelector)", () => {
    const a = {
      id: "1",
      motivation: "bookmarking",
      target: {
        selector: [
          { type: "FragmentSelector", conformsTo: "http://www.idpf.org/epub/linking/cfi/epub-cfi.html", value: "epubcfi(/6/4)" },
          { type: "TextQuoteSelector", exact: "hello" },
        ],
      },
    } as unknown as ReadingAnnotation;
    expect(getAnnotationCfi(a)).toBe("epubcfi(/6/4)");
  });

  it("toReaderBookmark returns null when not a bookmark or missing CFI", () => {
    const a1 = { id: "1", motivation: "highlighting" } as unknown as ReadingAnnotation;
    expect(toReaderBookmark(a1)).toBeNull();

    const a2 = { id: "2", motivation: "bookmarking", target: { selector: { type: "FragmentSelector", value: "" } } } as unknown as ReadingAnnotation;
    expect(toReaderBookmark(a2)).toBeNull();
  });
});

