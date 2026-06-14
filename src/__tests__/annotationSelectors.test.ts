import { describe, expect, it } from "vitest";
import type { ReadingAnnotation } from "@secondpass/client";
import {
  getAnnotationFragmentCfi,
  getAnnotationMotivations,
  isBookmarkAnnotation,
  isCommentAnnotation,
  isHighlightAnnotation,
} from "../features/reader/annotations/annotationSelectors";

describe("annotationSelectors", () => {
  it("extracts CFI from a single FragmentSelector", () => {
    const annotation = {
      id: "annotation-a",
      target: {
        selector: {
          type: "FragmentSelector",
          conformsTo: "http://www.idpf.org/epub/linking/cfi/epub-cfi.html",
          value: " epubcfi(/6/2) ",
        },
      },
    } as unknown as ReadingAnnotation;

    expect(getAnnotationFragmentCfi(annotation)).toBe("epubcfi(/6/2)");
  });

  it("extracts CFI from selector arrays", () => {
    const annotation = {
      id: "annotation-a",
      target: {
        selector: [
          { type: "TextQuoteSelector", exact: "hello" },
          {
            type: "FragmentSelector",
            conformsTo: "http://www.idpf.org/epub/linking/cfi/epub-cfi.html",
            value: "epubcfi(/6/4)",
          },
        ],
      },
    } as unknown as ReadingAnnotation;

    expect(getAnnotationFragmentCfi(annotation)).toBe("epubcfi(/6/4)");
  });

  it("returns null for missing or empty FragmentSelector values", () => {
    expect(getAnnotationFragmentCfi({ id: "missing-target" } as unknown as ReadingAnnotation)).toBeNull();
    expect(
      getAnnotationFragmentCfi({
        id: "missing-selector",
        target: {},
      } as unknown as ReadingAnnotation),
    ).toBeNull();
    expect(
      getAnnotationFragmentCfi({
        id: "empty-cfi",
        target: { selector: { type: "FragmentSelector", value: "   " } },
      } as unknown as ReadingAnnotation),
    ).toBeNull();
  });

  it("does not use href, spine, or chapter metadata as annotation location", () => {
    const annotation = {
      id: "annotation-a",
      target: {
        href: "chapter.xhtml",
        spineIndex: 2,
        chapter: "Chapter 1",
      },
    } as unknown as ReadingAnnotation;

    expect(getAnnotationFragmentCfi(annotation)).toBeNull();
  });

  it("normalizes motivations and detects known annotation kinds", () => {
    const annotation = {
      id: "annotation-a",
      motivation: ["Highlighting", "commenting"],
    } as unknown as ReadingAnnotation;

    expect(getAnnotationMotivations(annotation)).toEqual(["highlighting", "commenting"]);
    expect(isHighlightAnnotation(annotation)).toBe(true);
    expect(isCommentAnnotation(annotation)).toBe(true);
    expect(isBookmarkAnnotation(annotation)).toBe(false);
  });
});
