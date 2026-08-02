import { describe, expect, it } from "vitest";
import type { MarginaliaAnnotation } from "@secondpass/client";
import { getAnnotationColor, getAnnotationDescribingText, getAnnotationFragmentCfi, getAnnotationNoteText, isBookmarkAnnotation, isHighlightAnnotation } from "../features/reader/annotations/annotationUtils";

const bookmark = { id: "b", clientId: "cb", kind: "bookmark", location: { cfi: "epubcfi(/6/2)", locationLabel: "Location 08 - 42%" }, createdAt: "now", updatedAt: "now" } satisfies MarginaliaAnnotation;
const highlight = { id: "h", clientId: "ch", kind: "highlight", location: { cfi: "epubcfi(/6/4,/2,/8)", locationLabel: "Chapter 08 - 42%" }, body: { text: "Hello", prefix: "Before", suffix: "After", color: "yellow", note: "Note here" }, createdAt: "now", updatedAt: "now" } satisfies MarginaliaAnnotation;

describe("annotationUtils", () => {
  it("uses strict annotation kinds and location CFIs", () => {
    expect(isBookmarkAnnotation(bookmark)).toBe(true);
    expect(isHighlightAnnotation(highlight)).toBe(true);
    expect(getAnnotationFragmentCfi(highlight)).toBe("epubcfi(/6/4,/2,/8)");
  });

  it("extracts highlight body fields", () => {
    expect(getAnnotationDescribingText(highlight)).toBe("Hello");
    expect(getAnnotationNoteText(highlight)).toBe("Note here");
    expect(getAnnotationColor(highlight)).toBe("yellow");
  });
});
