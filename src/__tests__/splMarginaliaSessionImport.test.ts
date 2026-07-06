import { describe, expect, it } from "vitest";

import "../features/reader/imports/handlers/registerBuiltInReaderImportHandlers";
import { glaspCsvImportHandler } from "../features/reader/imports/handlers/glaspCsvImportHandler";
import {
  getReaderImportFormat,
  getReaderImportHandlers,
  registerReaderImportHandler,
} from "../features/reader/imports/readerImportFormats";

describe("reader import handlers", () => {
  it("exposes self-registered built-in import formats through the shared registry", () => {
    expect(getReaderImportHandlers().map((format) => format.kind)).toEqual(["glasp-csv", "spl-session-json"]);
    expect(getReaderImportHandlers().map((format) => format.displayName)).toEqual([
      "Glasp CSV",
      "SPL Marginalia",
    ]);
    expect(getReaderImportFormat("spl-session-json").description).toBe("Import a One Session File in SPL Marginalia Format");
  });

  it("keeps duplicate handler registration safe by kind", () => {
    const before = getReaderImportHandlers();
    registerReaderImportHandler(glaspCsvImportHandler);

    expect(getReaderImportHandlers()).toHaveLength(before.length);
    expect(getReaderImportFormat("glasp-csv")).toBe(glaspCsvImportHandler);
  });

  it("imports Glasp CSV through the handler boundary", async () => {
    const file = new File(["Highlight Text,Note,Color\nQuote,Note,yellow\n"], "glasp.csv", { type: "text/csv" });
    const job = await getReaderImportFormat("glasp-csv").importFile(file);

    expect(job).toMatchObject({
      format: "glasp-csv",
      fileName: "glasp.csv",
      summaryDisplay: {
        eyebrow: "Import file",
        title: "glasp.csv",
        metadata: [{ label: "Highlights", value: "1" }],
      },
      rows: [{ importedText: "Quote", importedNote: "Note", importedColor: "yellow", status: "pending" }],
    });
    expect(job.rows[0]?.kind).toBe("highlight");
  });

  it("accepts exactly one SPL session through the handler boundary", async () => {
    const file = jsonFile({
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
                  body: [{ type: "TextualBody", purpose: "describing", value: "Selected text", color: "green" }],
                  selector: { kind: "epub_cfi", value: "/6/2" },
                },
              ],
            },
          ],
        },
      ],
    });

    const job = await getReaderImportFormat("spl-session-json").importFile(file);

    expect(job.format).toBe("spl-session-json");
    expect(job.fileName).toBe("session.json");
    expect(job.summaryDisplay).toEqual({
      eyebrow: "Session",
      title: "Session label",
      metadata: [{ label: "Annotations", value: "1" }],
    });
    expect(job.rows).toHaveLength(1);
    expect(job.rows[0]).toMatchObject({
      id: "ann-1",
      kind: "highlight",
      index: 1,
      importedText: "Selected text",
      importedNote: "Note",
      importedColor: "green",
      normalizedColor: "green",
      importedLocation: "Location hint: /6/2",
      selectorHint: { kind: "epub_cfi", value: "/6/2" },
      status: "pending",
    });
  });

  it("maps SPL bookmarks to bookmark rows with selector hints and no quote requirement", async () => {
    const file = jsonFile({
      schema_version: "0.1.0",
      books: [
        {
          title: "Book",
          sessions: [
            {
              id: "session",
              annotations: [
                {
                  id: "bookmark-1",
                  motivation: ["bookmarking"],
                  target: {
                    selector: [{ type: "FragmentSelector", value: "epubcfi(/6/2)" }],
                  },
                },
                {
                  id: "bookmark-2",
                  kind: "bookmark",
                  selector: { kind: "epub_cfi", value: "/6/4" },
                },
              ],
            },
          ],
        },
      ],
    });

    const job = await getReaderImportFormat("spl-session-json").importFile(file);

    expect(job.rows).toEqual([
      expect.objectContaining({
        id: "bookmark-1",
        kind: "bookmark",
        importedText: "Bookmark",
        importedLocation: "Location hint: epubcfi(/6/2)",
        selectorHint: { kind: "epub_cfi", value: "epubcfi(/6/2)" },
        status: "pending",
      }),
      expect.objectContaining({
        id: "bookmark-2",
        kind: "bookmark",
        importedText: "Bookmark",
        importedLocation: "Location hint: /6/4",
        selectorHint: { kind: "epub_cfi", value: "/6/4" },
        status: "pending",
      }),
    ]);
  });

  it("keeps SPL highlights without quote text as empty highlight rows", async () => {
    const file = jsonFile({
      schema_version: "0.1.0",
      books: [
        {
          title: "Book",
          sessions: [
            {
              id: "session",
              annotations: [
                {
                  id: "empty-highlight",
                  motivation: ["highlighting"],
                  target: { selector: [{ type: "FragmentSelector", value: "epubcfi(/6/8)" }] },
                },
              ],
            },
          ],
        },
      ],
    });

    const job = await getReaderImportFormat("spl-session-json").importFile(file);

    expect(job.rows[0]).toMatchObject({
      id: "empty-highlight",
      kind: "highlight",
      importedText: "",
      selectorHint: { kind: "epub_cfi", value: "epubcfi(/6/8)" },
      status: "pending",
    });
  });

  it("rejects zero SPL sessions through the shared parse error contract", async () => {
    const file = jsonFile({ schema_version: "0.1.0", books: [{ title: "Book", sessions: [] }] }, "empty.json");

    await expect(getReaderImportFormat("spl-session-json").importFile(file)).rejects.toMatchObject({
      name: "ReaderImportParseError",
      code: "spl-session-empty",
      message: "This export does not contain any sessions to import.",
      action: undefined,
    });
  });

  it("rejects multiple SPL sessions and exposes the export splitter action", async () => {
    const file = jsonFile(
      {
        schema_version: "0.1.0",
        books: [{ title: "Book", sessions: [{ id: "one" }, { id: "two" }] }],
      },
      "multi.json",
    );

    await expect(getReaderImportFormat("spl-session-json").importFile(file)).rejects.toMatchObject({
      name: "ReaderImportParseError",
      code: "spl-session-multiple",
      message: "This export contains 2 sessions. Reader import works with one session at a time.",
      detail: { sessionCount: 2 },
      action: { label: "Open export splitter", href: "#/settings?tab=tools" },
    });
  });

  it("preserves SPL selectors, quotes, comments, colors, deleted flags, and unknown fields", async () => {
    const selectorArray = [
      { type: "FragmentSelector", value: "epubcfi(/old/hint)", custom: "keep" },
      { type: "TextQuoteSelector", exact: "quoted text", prefix: "before", suffix: "after" },
    ];
    const file = jsonFile({
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
                  body: [{ type: "TextualBody", purpose: "describing", value: "quoted text", color: "yellow" }],
                  deleted: true,
                  annotation_unknown: { keep: true },
                  target: { selector: selectorArray },
                },
              ],
            },
          ],
        },
      ],
    });

    const job = await getReaderImportFormat("spl-session-json").importFile(file);
    const row = job.rows[0]!;

    expect(row.importedText).toBe("quoted text");
    expect(row.importedNote).toBe("Comment");
    expect(row.importedColor).toBe("yellow");
    expect(row.rawAnnotation).toEqual({
      id: "ann",
      comment_text: "Comment",
      body: [{ type: "TextualBody", purpose: "describing", value: "quoted text", color: "yellow" }],
      deleted: true,
      annotation_unknown: { keep: true },
      target: { selector: selectorArray },
    });
    expect(job.summaryDisplay?.title).toBe("session");
  });

  it("reads SPL highlight color from body color through the handler boundary", async () => {
    const file = jsonFile({
      schema_version: "0.1.0",
      books: [
        {
          title: "Book",
          sessions: [
            {
              id: "session",
              annotations: [
                { id: "green", highlight_text: "Green", body: [{ type: "TextualBody", color: "green" }] },
                { id: "pink", highlight_text: "Pink", body: [{ type: "TextualBody", color: "pink" }] },
              ],
            },
          ],
        },
      ],
    });

    const job = await getReaderImportFormat("spl-session-json").importFile(file);

    expect(job.rows.map((row) => [row.id, row.importedColor, row.normalizedColor])).toEqual([
      ["green", "green", "green"],
      ["pink", "pink", "pink"],
    ]);
  });
});

function jsonFile(value: unknown, name = "session.json"): File {
  return new File([JSON.stringify(value)], name, { type: "application/json" });
}
