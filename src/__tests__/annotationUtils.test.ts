import { describe, expect, it } from "vitest";
import { getAnnotationColor, getAnnotationDescribingText, getAnnotationFragmentCfi, getAnnotationNoteText, isBookmarkAnnotation, isHighlightAnnotation } from "../features/reader/annotations/annotationUtils";

describe("annotationUtils", () => {
  it("detects bookmark motivation", () => {
    expect(isBookmarkAnnotation({ id: "1", motivation: "bookmarking" } as any)).toBe(true);
    expect(isBookmarkAnnotation({ id: "1", motivation: ["bookmarking"] } as any)).toBe(true);
    expect(isBookmarkAnnotation({ id: "1", motivation: "highlighting" } as any)).toBe(false);
  });

  it("detects highlight motivation", () => {
    expect(isHighlightAnnotation({ id: "1", motivation: "highlighting" } as any)).toBe(true);
    expect(isHighlightAnnotation({ id: "1", motivation: ["highlighting"] } as any)).toBe(true);
    expect(isHighlightAnnotation({ id: "1", motivation: "bookmarking" } as any)).toBe(false);
  });

  it("extracts fragment selector CFI from selector or selector[]", () => {
    const ann1 = { id: "a", target: { selector: { type: "FragmentSelector", value: "epubcfi(/6/2)" } } } as any;
    expect(getAnnotationFragmentCfi(ann1)).toBe("epubcfi(/6/2)");

    const ann2 = {
      id: "b",
      target: { selector: [{ type: "TextQuoteSelector", exact: "x" }, { type: "FragmentSelector", value: "epubcfi(/6/4)" }] },
    } as any;
    expect(getAnnotationFragmentCfi(ann2)).toBe("epubcfi(/6/4)");
  });

  it("extracts describing text from body", () => {
    const ann = {
      id: "a",
      body: [
        { type: "TextualBody", purpose: "describing", value: "  Hello  " },
        { type: "TextualBody", purpose: "commenting", value: "Note" },
      ],
    } as any;
    expect(getAnnotationDescribingText(ann)).toBe("Hello");
  });

  it("extracts note/comment text when present", () => {
    const ann = {
      id: "a",
      body: [
        { type: "TextualBody", purpose: "describing", value: "Quote" },
        { type: "TextualBody", purpose: "commenting", value: "  Note here  " },
      ],
    } as any;
    expect(getAnnotationNoteText(ann)).toBe("Note here");
  });

  it("extracts color token when present", () => {
    const ann = {
      id: "a",
      body: [{ type: "TextualBody", purpose: "describing", value: "Quote", color: "yellow" }],
    } as any;
    expect(getAnnotationColor(ann)).toBe("yellow");
  });
});
