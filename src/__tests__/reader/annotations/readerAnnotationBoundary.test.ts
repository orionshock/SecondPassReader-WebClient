import { describe, expect, it } from "vitest";
import type { MarginaliaAnnotation } from "@secondpass/client";
import { toReaderAnnotation } from "../../../features/reader/annotations/ReaderAnnotation.Mapper";
import {
  findReaderBookmarkAtCfi,
  getAnnotationColor,
  getAnnotationDescribingText,
  getAnnotationFragmentCfi,
  getAnnotationNoteText,
  isBookmarkAnnotation,
  isCommentAnnotation,
  isHighlightAnnotation,
} from "../../../features/reader/annotations/ReaderAnnotationSelectors.Queries";

const bookmark = {
  id: "bookmark-1",
  clientId: "client-bookmark",
  kind: "bookmark",
  location: { cfi: "epubcfi(/6/2)", locationLabel: "Chapter 1" },
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
} satisfies MarginaliaAnnotation;

const highlight = {
  id: "highlight-1",
  clientId: "client-highlight",
  kind: "highlight",
  location: { cfi: "epubcfi(/6/4,/2,/8)", locationLabel: "Chapter 2" },
  body: { text: "Hello", prefix: "Before", suffix: "After", color: "yellow", note: "Note here" },
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
} satisfies MarginaliaAnnotation;

describe("reader annotation boundary", () => {
  it("classifies canonical annotation kinds strictly", () => {
    expect(isBookmarkAnnotation(bookmark)).toBe(true);
    expect(isHighlightAnnotation(highlight)).toBe(true);
    expect(isCommentAnnotation(highlight)).toBe(true);
  });

  it("uses only a nonblank marginalia location CFI as the machine anchor", () => {
    expect(getAnnotationFragmentCfi(bookmark)).toBe("epubcfi(/6/2)");
    expect(getAnnotationFragmentCfi(highlight)).toBe("epubcfi(/6/4,/2,/8)");
    expect(getAnnotationFragmentCfi({ ...bookmark, location: { cfi: "", locationLabel: "Opaque" } })).toBeNull();
  });

  it("extracts canonical highlight body fields", () => {
    expect(getAnnotationDescribingText(highlight)).toBe("Hello");
    expect(getAnnotationNoteText(highlight)).toBe("Note here");
    expect(getAnnotationColor(highlight)).toBe("yellow");
  });

  it("preserves server-returned highlight prose exactly", () => {
    const stored = {
      ...highlight,
      body: { ...highlight.body, text: "Stored\n\n exactly\t as returned" },
    };
    expect(getAnnotationDescribingText(stored)).toBe("Stored\n\n exactly\t as returned");
  });

  it("maps marginalia bookmarks into the Reader domain", () => {
    expect(toReaderAnnotation(bookmark)).toEqual({
      kind: "bookmark",
      id: "bookmark-1",
      cfi: "epubcfi(/6/2)",
    });
  });

  it("maps marginalia highlights into the Reader domain", () => {
    expect(toReaderAnnotation(highlight)).toEqual({
      kind: "highlight",
      id: "highlight-1",
      cfiRange: "epubcfi(/6/4,/2,/8)",
      text: "Hello",
    });
  });

  it("rejects annotations without a CFI", () => {
    expect(toReaderAnnotation({ ...bookmark, location: { cfi: "", locationLabel: "Opaque" } })).toBeNull();
    expect(toReaderAnnotation({ ...highlight, location: { cfi: "", locationLabel: "Opaque" } })).toBeNull();
  });

  it("finds the current bookmark by exact CFI after normalizing the current location", () => {
    const bookmarks = [
      { id: "bookmark-1", cfi: "epubcfi(/6/2)" },
      { id: "bookmark-2", cfi: "epubcfi(/6/4)" },
    ];

    expect(findReaderBookmarkAtCfi(bookmarks, " epubcfi(/6/4) ")).toBe(bookmarks[1]);
    expect(findReaderBookmarkAtCfi(bookmarks, "")).toBeNull();
    expect(findReaderBookmarkAtCfi(bookmarks, "epubcfi(/6/6)")).toBeNull();
  });
});
