import { describe, expect, it } from "vitest";
import { getLibrarySearchPlaceholder } from "../features/library/controls/librarySearchPlaceholder";

describe("Library search placeholder", () => {
  it("describes the current axis and scope", () => {
    expect(getLibrarySearchPlaceholder({ axis: "books", searchMode: "axis" })).toBe("Search books...");
    expect(getLibrarySearchPlaceholder({ axis: "books", scopeName: "Classics", searchMode: "axis" })).toBe("Search books in Classics...");
    expect(getLibrarySearchPlaceholder({ axis: "authors", scopeName: "Classics", searchMode: "axis" })).toBe("Search authors in Classics...");
    expect(getLibrarySearchPlaceholder({ axis: "series", scopeName: "Classics", searchMode: "axis" })).toBe("Search series in Classics...");
  });

  it("uses broad copy for global search", () => {
    expect(getLibrarySearchPlaceholder({ axis: "books", searchMode: "global" }))
      .toBe("Search books, authors, series, publishers...");
  });
});
