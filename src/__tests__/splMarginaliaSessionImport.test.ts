import { describe, expect, it } from "vitest";

import {
  parseSplMarginaliaSessionImport,
  SPL_EXPORT_SPLITTER_ROUTE,
  SplMarginaliaSessionCountError,
} from "../features/reader/imports/splMarginaliaSessionImport";

describe("SPL marginalia session import staging", () => {
  it("accepts exactly one session", () => {
    const parsed = parseSplMarginaliaSessionImport(
      JSON.stringify({
        schema_version: "0.1.0",
        books: [
          {
            title: "Book",
            author: ["Author"],
            sessions: [
              {
                id: "session-1",
                label: "Session label",
                annotations: [
                  {
                    id: "ann-1",
                    highlight_text: "Selected text",
                    comment_text: "Note",
                    highlight_color: "green",
                    selector: { kind: "epub_cfi", value: "/6/2" },
                  },
                ],
              },
            ],
          },
        ],
      }),
      "session.json",
      new Date("2026-07-06T12:00:00Z"),
    );

    expect(parsed.job.format).toBe("spl-session-json");
    expect(parsed.job.fileName).toBe("session.json");
    expect(parsed.job.readOnly).toBe(true);
    expect(parsed.job.sourceSummary).toEqual({
      bookLabel: "Book - Author",
      sessionLabel: "Session label",
      annotationCount: 1,
      commentCount: 1,
      colorCount: 1,
      deletedCount: 0,
    });
    expect(parsed.job.rows).toHaveLength(1);
    expect(parsed.job.rows[0]).toMatchObject({
      id: "ann-1",
      index: 1,
      importedText: "Selected text",
      importedNote: "Note",
      importedColor: "green",
      normalizedColor: "green",
      importedLocation: "Location hint: /6/2",
      status: "staged",
    });
  });

  it("rejects zero sessions", () => {
    expect(() =>
      parseSplMarginaliaSessionImport(JSON.stringify({ schema_version: "0.1.0", books: [{ title: "Book", sessions: [] }] }), "empty.json"),
    ).toThrowError("This export does not contain any sessions to import.");
  });

  it("rejects multiple sessions and reports the count", () => {
    try {
      parseSplMarginaliaSessionImport(
        JSON.stringify({
          schema_version: "0.1.0",
          books: [
            {
              title: "Book",
              sessions: [
                { id: "one", annotations: [] },
                { id: "two", annotations: [] },
              ],
            },
          ],
        }),
        "multi.json",
      );
      throw new Error("Expected parse to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(SplMarginaliaSessionCountError);
      expect(error).toMatchObject({ sessionCount: 2 });
      expect((error as Error).message).toBe("This export contains 2 sessions. Reader import works with one session at a time.");
    }

    expect(SPL_EXPORT_SPLITTER_ROUTE).toBe("#/settings?tab=tools");
  });

  it("preserves selectors, quotes, comments, colors, deleted flags, and unknown fields", () => {
    const selectorArray = [
      { type: "FragmentSelector", value: "epubcfi(/old/hint)", custom: "keep" },
      { type: "TextQuoteSelector", exact: "quoted text", prefix: "before", suffix: "after" },
    ];
    const parsed = parseSplMarginaliaSessionImport(
      JSON.stringify({
        schema_version: "0.1.0",
        export_unknown: "keep",
        books: [
          {
            title: "Book",
            reading_sessions: [
              {
                id: "session",
                session_unknown: true,
                items: [
                  {
                    id: "ann",
                    comment_text: "Comment",
                    color: "yellow",
                    deleted: true,
                    annotation_unknown: { keep: true },
                    target: { selector: selectorArray },
                  },
                ],
              },
            ],
          },
        ],
      }),
      "session.json",
    );

    const row = parsed.job.rows[0]!;
    expect(row.importedText).toBe("quoted text");
    expect(row.importedNote).toBe("Comment");
    expect(row.importedColor).toBe("yellow");
    expect(row.rawAnnotation).toEqual({
      id: "ann",
      comment_text: "Comment",
      color: "yellow",
      deleted: true,
      annotation_unknown: { keep: true },
      target: { selector: selectorArray },
    });
    expect((parsed.item.exportJson.books as any[])[0].reading_sessions[0].session_unknown).toBe(true);
    expect(parsed.item.exportJson.export_unknown).toBe("keep");
    expect(parsed.job.sourceSummary?.deletedCount).toBe(1);
  });
});
