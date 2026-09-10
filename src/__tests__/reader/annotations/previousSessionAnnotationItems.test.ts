import { describe, expect, it } from "vitest";
import type { MarginaliaAnnotation } from "@secondpass/client";
import { toPreviousSessionHighlightMarks, toPreviousSessionItems, type PreviousSessionLocationDescriptionCacheEntry } from "../../../features/reader/session/previousSession/PreviousSessionAnnotationItems.Presenter";

const annotations: MarginaliaAnnotation[] = [
  { id: "highlight-a", clientId: "client-h", kind: "highlight", location: { cfi: "epubcfi(/6/2,/4/2,/4/8)", locationLabel: "Chapter 08 - 42%" }, body: { text: "Quoted text", prefix: "", suffix: "", color: "yellow", note: "Note text" }, createdAt: "2024-01-01", updatedAt: "2024-01-02" },
  { id: "bookmark-a", clientId: "client-b", kind: "bookmark", location: { cfi: "epubcfi(/6/4)", locationLabel: "Server label" }, createdAt: "2024-01-01", updatedAt: "2024-01-01" },
];

describe("previousSessionAnnotationItems", () => {
  it("maps previous highlights to read-only reader marks", () => {
    expect(toPreviousSessionHighlightMarks(annotations, "session-a")).toEqual({ marks: [{ id: "highlight-a", cfiRange: "epubcfi(/6/2,/4/2,/4/8)", text: "Quoted text", readOnly: true, sessionId: "session-a", color: "yellow", note: "Note text" }], highlightCount: 1 });
  });

  it("displays opaque server location labels unchanged", () => {
    const descriptions = new Map<string, PreviousSessionLocationDescriptionCacheEntry>([["epubcfi(/6/4)", { status: "ready", value: { cfi: "epubcfi(/6/4)", href: "chapter.xhtml" } }]]);
    const items = toPreviousSessionItems(annotations, descriptions, [{ id: "toc", href: "chapter.xhtml", label: "Derived label" }]);
    expect(items.find((item) => item.kind === "bookmark")?.locationLabel).toBe("Server label");
    expect(items.find((item) => item.kind === "highlight")?.locationLabel).toBe("Chapter 08 - 42%");
  });
});
