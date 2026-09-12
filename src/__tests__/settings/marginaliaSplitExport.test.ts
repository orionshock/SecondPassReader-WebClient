import { describe, expect, it } from "vitest";

import {
  buildAllZipEntries,
  buildBookFolderName,
  buildBookZipFilename,
  buildSplitFilename,
  filterMarginaliaBookGroups,
  groupMarginaliaSplitItems,
  parseAndSplitMarginaliaExport,
  splitMarginaliaExport,
} from "../../features/settings/MarginaliaSplitExport.Actions";

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

  it("preserves unknown top-level, session, annotation, and selector fields mechanically", () => {
    const selectorObject = {
      type: "FragmentSelector",
      value: "epubcfi(/old/hint)",
      unknown_selector_field: { keep: true },
    };
    const selectorArray = [
      selectorObject,
      {
        type: "TextQuoteSelector",
        exact: "selected",
        prefix: "before",
        suffix: "after",
        custom_quote_field: 42,
      },
    ];
    const exportJson = {
      schema_version: "0.1.0",
      export_unknown: { keep: "top" },
      books: [
        {
          id: "book",
          book_unknown: ["keep"],
          sessions: [
            {
              id: "session-object",
              progress: null,
              session_unknown: { keep: "session" },
              annotations: [
                {
                  id: "annotation-object",
                  annotation_unknown: { keep: "annotation" },
                  target: { selector: selectorObject },
                },
              ],
            },
            {
              id: "session-array",
              annotations: [{ id: "annotation-array", target: { selector: selectorArray } }],
            },
          ],
        },
      ],
    };

    const result = splitMarginaliaExport(exportJson);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.exportJson.export_unknown).toEqual({ keep: "top" });

    const objectBook = (result.items[0]!.exportJson.books as any[])[0];
    expect(objectBook.book_unknown).toEqual(["keep"]);
    expect(objectBook.sessions).toHaveLength(1);
    expect(objectBook.sessions[0].session_unknown).toEqual({ keep: "session" });
    expect(objectBook.sessions[0].progress).toBeNull();
    expect(objectBook.sessions[0].annotations[0].annotation_unknown).toEqual({ keep: "annotation" });
    expect(objectBook.sessions[0].annotations[0].target.selector).toEqual(selectorObject);

    const arrayBook = (result.items[1]!.exportJson.books as any[])[0];
    expect(arrayBook.sessions[0].annotations[0].target.selector).toEqual(selectorArray);
  });

  it("keeps the base split result unchanged when filtering zero-annotation groups", () => {
    const result = splitMarginaliaExport({
      schema_version: "0.1.0",
      books: [
        {
          id: "book-with-mixed",
          sessions: [
            { id: "empty", annotations: [] },
            { id: "non-empty", annotations: [{ id: "ann" }] },
          ],
        },
        {
          id: "book-with-empty-only",
          sessions: [{ id: "empty-only", annotations: [] }],
        },
      ],
    });
    const groups = groupMarginaliaSplitItems(result.items);
    const visibleGroups = filterMarginaliaBookGroups(groups, true);

    expect(result.items.map((item) => item.session.id)).toEqual(["empty", "non-empty", "empty-only"]);
    expect(groups.map((group) => group.items.map((item) => item.session.id))).toEqual([["empty", "non-empty"], ["empty-only"]]);
    expect(visibleGroups.map((group) => group.items.map((item) => item.session.id))).toEqual([["non-empty"]]);
    expect(filterMarginaliaBookGroups(groups, false)).toBe(groups);
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

  it("generates collision-safe session filenames", () => {
    const first = buildSplitFilename({
      book: { title: "Same Book" },
      session: { id: "same-session" },
      bookIndex: 0,
      sessionIndex: 0,
    });
    const second = buildSplitFilename({
      book: { title: "Same Book" },
      session: { id: "same-session" },
      bookIndex: 0,
      sessionIndex: 1,
    });

    expect(first).toBe("01-01-Same-Book-same-session.json");
    expect(second).toBe("01-02-Same-Book-same-session.json");
  });

  it("builds safe book folder and zip names", () => {
    expect(buildBookFolderName({ book: { title: "Dresden: Files/Storm Front" }, bookIndex: 0 })).toBe(
      "01-Dresden-Files-Storm-Front",
    );
    expect(buildBookZipFilename({ book: { title: "Dresden: Files/Storm Front" }, bookIndex: 0 })).toBe(
      "01-Dresden-Files-Storm-Front.zip",
    );
  });

  it("groups session split files by book and builds all-zip paths", () => {
    const result = splitMarginaliaExport({
      schema_version: "0.1.0",
      books: [
        {
          title: "Same/Book",
          sessions: [
            { id: "session-1", annotations: [] },
            { id: "session-2", annotations: [] },
          ],
        },
        {
          title: "Same/Book",
          sessions: [{ id: "session-3", annotations: [] }],
        },
      ],
    });

    const groups = groupMarginaliaSplitItems(result.items);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.folderName).toBe("01-Same-Book");
    expect(groups[1]!.folderName).toBe("02-Same-Book");
    expect(groups[0]!.zipFilename).toBe("01-Same-Book.zip");

    expect(buildAllZipEntries(groups).map((entry) => entry.path)).toEqual([
      "01-Same-Book/01-01-Same-Book-session-1.json",
      "01-Same-Book/01-02-Same-Book-session-2.json",
      "02-Same-Book/02-01-Same-Book-session-3.json",
    ]);
  });

  it("parses JSON and rejects unsupported shapes", () => {
    expect(parseAndSplitMarginaliaExport(JSON.stringify({ schema_version: "0.1.0", books: [{ id: "b", sessions: [] }] }))).toEqual({
      summary: { bookCount: 1, sessionCount: 0, annotationCount: 0 },
      items: [],
    });

    expect(() => parseAndSplitMarginaliaExport("{broken")).toThrow();
    expect(() => splitMarginaliaExport({ schema_version: "9.9.9", books: [] })).toThrow();
    expect(() => splitMarginaliaExport({ schema_version: "0.1.0", books: [] })).toThrow();
  });
});
