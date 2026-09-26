import { describe, expect, it } from "vitest";
import type { MarginaliaAnnotation } from "@secondpass/client";
import {
  buildSessionBookmarkViewModels,
  sortSessionAnnotations,
  toSessionAnnotationBookmarks,
} from "../../../features/reader/session/annotations/SessionAnnotations.Presenter";

function bookmark(id: string, updatedAt: string): MarginaliaAnnotation {
  return {
    id,
    clientId: `client-${id}`,
    kind: "bookmark",
    location: { location: `epubcfi(/6/${id.length})`, locationLabel: id },
    createdAt: updatedAt,
    updatedAt,
  };
}

describe("session annotations presentation", () => {
  it("sorts annotations newest first and uses descending ids as the stable tie-break", () => {
    const old = bookmark("old", "2026-08-01T00:00:00Z");
    const tieA = bookmark("tie-a", "2026-08-02T00:00:00Z");
    const tieZ = bookmark("tie-z", "2026-08-02T00:00:00Z");

    expect(sortSessionAnnotations([old, tieA, tieZ]).map((annotation) => annotation.id)).toEqual([
      "tie-z",
      "tie-a",
      "old",
    ]);
  });

  it("carries both durable lifecycle timestamps into current-session view models", () => {
    const annotation = bookmark("bookmark", "2026-08-02T00:00:00Z");
    annotation.createdAt = "2026-08-01T00:00:00Z";
    const sortedRaw = [annotation];
    const viewModels = buildSessionBookmarkViewModels({
      bookmarks: toSessionAnnotationBookmarks(sortedRaw),
      sortedRaw,
      descriptions: {},
      currentCfi: null,
      currentBookProgress: null,
      toc: null,
      bookTitle: "Book",
      describeCfiAvailable: false,
    });
    expect(viewModels[0]).toMatchObject({
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-02T00:00:00Z",
    });
  });
});
