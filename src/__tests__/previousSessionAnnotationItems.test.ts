import { describe, expect, it } from "vitest";
import type { ReadingAnnotation } from "@secondpass/client";

import {
  toPreviousSessionHighlightMarks,
  toPreviousSessionItems,
  type PreviousSessionLocationDescriptionCacheEntry,
} from "../features/reader/session/previousSessionAnnotationItems";

describe("previousSessionAnnotationItems", () => {
  it("maps previous highlights to read-only reader marks with note and color", () => {
    const annotations = [
      {
        id: "highlight-a",
        motivation: ["highlighting"],
        target: { selector: { type: "FragmentSelector", value: "epubcfi(/6/2,/4/2,/4/8)" } },
        body: [
          { type: "TextualBody", purpose: "describing", value: "  Quoted text  " },
          { type: "TextualBody", purpose: "commenting", value: "  Note text  " },
          { type: "TextualBody", purpose: "tagging", color: "yellow" },
        ],
      },
      {
        id: "bookmark-a",
        motivation: ["bookmarking"],
        target: { selector: { type: "FragmentSelector", value: "epubcfi(/6/4)" } },
      },
    ] as unknown as ReadingAnnotation[];

    expect(toPreviousSessionHighlightMarks(annotations, "session-a")).toEqual({
      marks: [
        {
          id: "highlight-a",
          cfiRange: "epubcfi(/6/2,/4/2,/4/8)",
          text: "Quoted text",
          readOnly: true,
          sessionId: "session-a",
          color: "yellow",
          note: "Note text",
        },
      ],
      highlightCount: 1,
    });
  });

  it("maps previous annotations to workspace items with cached CFI labels", () => {
    const annotations = [
      {
        id: "bookmark-a",
        motivation: ["bookmarking"],
        created: "2024-01-01T00:00:00.000Z",
        target: { selector: { type: "FragmentSelector", value: "epubcfi(/6/4)" } },
      },
      {
        id: "highlight-a",
        motivation: ["highlighting"],
        modified: "2024-01-02T00:00:00.000Z",
        target: { selector: { type: "FragmentSelector", value: "epubcfi(/6/2,/4/2,/4/8)" } },
        body: [
          { type: "TextualBody", purpose: "describing", value: "Quoted text" },
          { type: "TextualBody", purpose: "commenting", value: "Note text" },
        ],
      },
    ] as unknown as ReadingAnnotation[];
    const descriptions = new Map<string, PreviousSessionLocationDescriptionCacheEntry>([
      ["epubcfi(/6/4)", { status: "ready", value: { cfi: "epubcfi(/6/4)", href: "text/part0001.html" } }],
      ["epubcfi(/6/2,/4/2,/4/8)", { status: "loading" }],
    ]);

    expect(
      toPreviousSessionItems(
        annotations,
        descriptions,
        [{ id: "toc-1", href: "text/part0001.html", label: "Chapter 1" }],
        "Book title",
      ),
    ).toEqual([
      {
        kind: "bookmark",
        id: "bookmark-a",
        cfi: "epubcfi(/6/4)",
        timestamp: "2024-01-01T00:00:00.000Z",
        locationLabel: "Chapter 1",
        descriptionStatus: "ready",
      },
      {
        kind: "highlight",
        id: "highlight-a",
        cfiRange: "epubcfi(/6/2,/4/2,/4/8)",
        text: "Quoted text",
        note: "Note text",
        color: undefined,
        timestamp: "2024-01-02T00:00:00.000Z",
        locationLabel: undefined,
        descriptionStatus: "loading",
      },
    ]);
  });

  it("skips annotations without canonical CFI selectors", () => {
    const annotations = [
      {
        id: "highlight-a",
        motivation: ["highlighting"],
        target: { href: "text/part0001.html" },
        body: [{ type: "TextualBody", purpose: "describing", value: "Quoted text" }],
      },
    ] as unknown as ReadingAnnotation[];

    expect(toPreviousSessionHighlightMarks(annotations)).toEqual({ marks: [], highlightCount: 0 });
    expect(toPreviousSessionItems(annotations, new Map(), null)).toEqual([]);
  });
});
