import { describe, expect, it } from "vitest";

import { deriveBookmarkLabel } from "../features/reader/annotations/bookmarkLabels";

describe("deriveBookmarkLabel", () => {
  it("uses chapter label and percent when both are present", () => {
    expect(deriveBookmarkLabel({ chapterLabel: "Chapter 4", bookProgress: 0.214 })).toBe("Chapter 4 · 21%");
  });

  it("uses chapter label only when progress is missing", () => {
    expect(deriveBookmarkLabel({ chapterLabel: "Chapter 4", bookProgress: null })).toBe("Chapter 4");
  });

  it("uses Saved location + percent when chapter is missing", () => {
    expect(deriveBookmarkLabel({ chapterLabel: null, bookProgress: 0.01 })).toBe("Saved location · 1%");
  });

  it("falls back to Saved location when nothing is available", () => {
    expect(deriveBookmarkLabel({ chapterLabel: "", bookProgress: undefined })).toBe("Saved location");
  });
});

