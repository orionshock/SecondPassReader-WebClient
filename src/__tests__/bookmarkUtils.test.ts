import { describe, expect, it } from "vitest";
import type { MarginaliaAnnotation } from "@secondpass/client";
import { toReaderBookmark } from "../features/reader/annotations/bookmarkUtils";

describe("reader bookmark utils", () => {
  it("converts marginalia bookmarks from their CFI location", () => {
    const annotation = { id: "1", clientId: "c1", kind: "bookmark", location: { cfi: "epubcfi(/6/2)", locationLabel: "Chapter 1" }, createdAt: "now", updatedAt: "now" } satisfies MarginaliaAnnotation;
    expect(toReaderBookmark(annotation)).toEqual({ kind: "bookmark", id: "1", cfi: "epubcfi(/6/2)" });
  });
});
