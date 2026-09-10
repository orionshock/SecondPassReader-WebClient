import { describe, expect, it } from "vitest";
import type { MarginaliaAnnotation } from "@secondpass/client";
import { sortSessionAnnotations } from "../../../features/reader/session/annotations/SessionAnnotations.Presenter";

function bookmark(id: string, updatedAt: string): MarginaliaAnnotation {
  return {
    id,
    clientId: `client-${id}`,
    kind: "bookmark",
    location: { cfi: `epubcfi(/6/${id.length})`, locationLabel: id },
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
});
