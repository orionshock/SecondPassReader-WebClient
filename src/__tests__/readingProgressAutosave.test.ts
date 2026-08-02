import { describe, expect, it } from "vitest";
import { buildReadingProgressSaveInput } from "../features/reader/session/useReadingProgressAutosave";

describe("reading progress autosave input", () => {
  it("sends the stable generated location label instead of rendered-page metadata", () => {
    expect(buildReadingProgressSaveInput({
      cfi: "epubcfi(/6/2)",
      sectionIndex: 7,
      sectionCount: 12,
      bookProgress: 0.42,
      displayedPage: 1,
      displayedTotal: 10,
      href: "The Blackstaff.xhtml",
    })).toEqual({
      cfi: "epubcfi(/6/2)",
      locationLabel: "Chapter 08 - 42%",
    });
  });
});
