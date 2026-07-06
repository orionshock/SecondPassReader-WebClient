import { describe, expect, it } from "vitest";

import { buildSplitFilename, parseAndSplitMarginaliaExport, splitMarginaliaExport } from "../features/settings/marginaliaSplitExport";

describe("marginalia split export", () => {
  it("splits multiple books and sessions into mini exports", () => {
    const exportJson = {
      schema_version: "0.1.0",
      generated_at: "2026-07-06T12:00:00Z",
      books: [
        {
          id: "book-1",
          title: "First Book",
          author: ["Ada Lovelace"],
          sessions: [
            {
              id: "session-1",
              started_at: "2026-07-01T00:00:00Z",
              progress: null,
              annotations: [
                {
                  id: "ann-1",
                  deleted: false,
                  color: "green",
                  comment_text: "Note",
                  target: {
                    selector: {
                      type: "FragmentSelector",
                      value: "epubcfi(/bad/old-cfi)",
                    },
                  },
                },
              ],
            },
            {
              id: "session-2",
              current_location: null,
              annotations: [],
            },
          ],
        },
        {
          id: "book-2",
          title: "Second Book",
          sessions: [
            {
              id: "session-3",
              annotations: [
                {
                  id: "ann-2",
                  target: {
                    selector: [
                      {
                        type: "FragmentSelector",
                        value: "epubcfi(/another/broken-cfi)",
                      },
                      {
                        type: "TextQuoteSelector",
                        exact: "selected text",
                        prefix: "before",
                        suffix: "after",
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const result = splitMarginaliaExport(exportJson);

    expect(result.summary).toEqual({
      bookCount: 2,
      sessionCount: 3,
      annotationCount: 2,
    });
    expect(result.items).toHaveLength(3);

    const firstBooks = result.items[0]!.exportJson.books as any[];
    expect(firstBooks).toHaveLength(1);
    const firstBook = firstBooks[0];
    expect(firstBook.sessions).toHaveLength(1);
    expect(firstBook.sessions[0].id).toBe("session-1");
    expect(firstBook.sessions[0].progress).toBeNull();
    expect(firstBook.sessions[0].annotations[0].target.selector).toEqual({
      type: "FragmentSelector",
      value: "epubcfi(/bad/old-cfi)",
    });

    const emptySessionBook = (result.items[1]!.exportJson.books as any[])[0];
    expect(emptySessionBook.sessions[0].id).toBe("session-2");
    expect(emptySessionBook.sessions[0].annotations).toEqual([]);
    expect(emptySessionBook.sessions[0].current_location).toBeNull();

    const quoteSessionBook = (result.items[2]!.exportJson.books as any[])[0];
    expect(quoteSessionBook.sessions[0].annotations[0].target.selector).toEqual([
      {
        type: "FragmentSelector",
        value: "epubcfi(/another/broken-cfi)",
      },
      {
        type: "TextQuoteSelector",
        exact: "selected text",
        prefix: "before",
        suffix: "after",
      },
    ]);
  });

  it("preserves exact-only and exact-prefix quote selectors", () => {
    const result = splitMarginaliaExport({
      schemaVersion: "0.1.0",
      books: [
        {
          id: "book",
          sessions: [
            {
              id: "session",
              annotations: [
                { id: "exact", target: { selector: [{ type: "TextQuoteSelector", exact: "only" }] } },
                { id: "prefix", target: { selector: [{ type: "TextQuoteSelector", exact: "quote", prefix: "before" }] } },
              ],
            },
          ],
        },
      ],
    });

    const annotations = ((result.items[0]!.exportJson.books as any[])[0].sessions[0].annotations) as any[];
    expect(annotations[0].target.selector[0]).toEqual({ type: "TextQuoteSelector", exact: "only" });
    expect(annotations[1].target.selector[0]).toEqual({ type: "TextQuoteSelector", exact: "quote", prefix: "before" });
  });

  it("supports reading_sessions/items aliases while preserving source keys", () => {
    const result = splitMarginaliaExport({
      schema_version: "0.1.0",
      books: [
        {
          id: "book",
          reading_sessions: [
            {
              id: "session",
              items: [{ id: "ann" }],
            },
          ],
        },
      ],
    });

    const book = (result.items[0]!.exportJson.books as any[])[0];
    expect(book.reading_sessions).toHaveLength(1);
    expect(book.reading_sessions[0].items).toEqual([{ id: "ann" }]);
    expect(book.sessions).toBeUndefined();
  });

  it("generates safe ASCII filenames", () => {
    expect(
      buildSplitFilename({
        book: { title: "Dresden: Files/Storm Front" },
        session: { id: "session\\one?*" },
        bookIndex: 0,
        sessionIndex: 0,
      }),
    ).toBe("01-01-Dresden-Files-Storm-Front-session-one.json");
  });

  it("parses JSON and rejects unsupported shapes", () => {
    expect(parseAndSplitMarginaliaExport(JSON.stringify({ schema_version: "0.1.0", books: [{ id: "b", sessions: [] }] }))).toEqual({
      summary: { bookCount: 1, sessionCount: 0, annotationCount: 0 },
      items: [],
    });

    expect(() => parseAndSplitMarginaliaExport("{broken")).toThrowError(/Invalid JSON/i);
    expect(() => splitMarginaliaExport({ schema_version: "9.9.9", books: [] })).toThrowError(/Unsupported/i);
    expect(() => splitMarginaliaExport({ schema_version: "0.1.0", books: [] })).toThrowError(/does not contain any books/i);
  });
});
