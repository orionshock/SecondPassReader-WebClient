import { describe, expect, it } from "vitest";

import {
  formatAnnotationCount,
  formatIso,
  formatProgress,
  getAnnotationTexts,
  normalizeStatus,
} from "../features/sessions/sessionDetailDisplay";

describe("sessionDetailDisplay", () => {
  it("formats progress, annotation counts, and status labels", () => {
    expect(formatProgress(0.456)).toBe("46%");
    expect(formatProgress(2)).toBe("100%");
    expect(formatProgress(null)).toBeNull();

    expect(formatAnnotationCount(1)).toBe("1 annotation");
    expect(formatAnnotationCount(2.9)).toBe("2 annotations");
    expect(formatAnnotationCount(null)).toBeNull();

    expect(normalizeStatus(" Archived ", false)).toBe("archived");
    expect(normalizeStatus(null, true)).toBe("active");
    expect(normalizeStatus(null, false)).toBe("completed");
  });

  it("keeps invalid ISO text as a clean fallback", () => {
    expect(formatIso("not-a-date")).toBe("not-a-date");
    expect(formatIso(null)).toBeNull();
  });

  it("extracts quote and note text without href or chapter assumptions", () => {
    expect(
      getAnnotationTexts({
        target: { href: "chapter.xhtml", chapter: "Chapter 1" },
        body: [
          { type: "TextualBody", purpose: "describing", value: "  A quoted   passage  " },
          { type: "TextualBody", purpose: "commenting", value: "  A note  " },
        ],
      }),
    ).toEqual({ quote: "A quoted passage", note: "A note" });
  });

  it("preserves existing fallback behavior for highlight and comment bodies", () => {
    expect(
      getAnnotationTexts({
        motivation: ["highlighting"],
        body: [{ type: "TextualBody", value: "First body" }],
      }),
    ).toEqual({ quote: "First body", note: null });

    expect(
      getAnnotationTexts({
        motivation: ["commenting"],
        body: [{ type: "TextualBody", value: "Only note" }],
      }),
    ).toEqual({ quote: null, note: "Only note" });
  });
});
