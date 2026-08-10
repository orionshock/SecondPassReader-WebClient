import { describe, expect, it } from "vitest";
import type { MarginaliaAnnotation } from "@secondpass/client";
import { getAnnotationFragmentCfi, isBookmarkAnnotation, isCommentAnnotation, isHighlightAnnotation } from "../features/reader/annotations/ReaderAnnotationSelectors.Queries";

const bookmark = { id: "a", clientId: "client-a", kind: "bookmark", location: { cfi: "epubcfi(/6/2)", locationLabel: "Chapter 1" }, createdAt: "2026-01-01", updatedAt: "2026-01-01" } satisfies MarginaliaAnnotation;
const highlight = { id: "b", clientId: "client-b", kind: "highlight", location: { cfi: "epubcfi(/6/4,/2,/8)", locationLabel: "Chapter 2" }, body: { text: "Quote", prefix: "", suffix: "", color: "yellow", note: "Note" }, createdAt: "2026-01-01", updatedAt: "2026-01-01" } satisfies MarginaliaAnnotation;

describe("annotationSelectors", () => {
  it("uses the marginalia location CFI as the machine anchor", () => {
    expect(getAnnotationFragmentCfi(bookmark)).toBe("epubcfi(/6/2)");
    expect(getAnnotationFragmentCfi({ ...bookmark, location: { cfi: "", locationLabel: "Opaque" } })).toBeNull();
  });

  it("detects strict marginalia annotation kinds", () => {
    expect(isBookmarkAnnotation(bookmark)).toBe(true);
    expect(isHighlightAnnotation(highlight)).toBe(true);
    expect(isCommentAnnotation(highlight)).toBe(true);
  });
});
