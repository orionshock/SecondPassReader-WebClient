import { describe, expect, it } from "vitest";

import "../../../features/reader/imports/handlers/ReaderImportHandlers.Lifecycle";
import { glaspCsvImportHandler } from "../../../features/reader/imports/handlers/glaspCsv/GlaspCsvImport.Handler";
import {
  getReaderImportFormat,
  getReaderImportHandlers,
  registerReaderImportHandler,
} from "../../../features/reader/imports/ReaderImportFormats.Registry";

const CFI = "epubcfi(/6/8!/4/2[chapter],/1:2,/1:8)";

describe("reader import handlers", () => {
  it("exposes self-registered built-in import formats through the shared registry", () => {
    expect(getReaderImportHandlers().map((format) => format.kind)).toEqual(["glasp-csv", "spl-session-json"]);
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
      rows: [{ quoteText: "Quote", noteText: "Note", color: "yellow", status: "pending" }],
    });
  });

  it("maps canonical Marginalia locations and quote context without changing the EPUB CFI", async () => {
    const job = await getReaderImportFormat("spl-session-json").importFile(jsonFile(archive([
      highlight("highlight-1", CFI),
      bookmark("bookmark-1", "epubcfi(/6/10!/4/2)"),
    ])));

    expect(job).toMatchObject({
      format: "spl-session-json",
      summaryDisplay: "Imported Session",
      rows: [
        {
          id: "highlight-1",
          kind: "highlight",
          cfiHint: CFI,
          quoteText: "Selected text",
          preQuoteText: "Before",
          postQuoteText: "After",
          noteText: "Note",
          color: "green",
          status: "pending",
        },
        {
          id: "bookmark-1",
          kind: "bookmark",
          cfiHint: "epubcfi(/6/10!/4/2)",
          status: "pending",
        },
      ],
    });
  });

  it("rejects old cfi archive keys instead of treating them as location hints", async () => {
    const value = archive([{ ...bookmark("bookmark-1", CFI), location: { cfi: CFI } }]);
    await expect(getReaderImportFormat("spl-session-json").importFile(jsonFile(value))).rejects.toThrow(/location\.location/);
  });

  it("rejects zero or multiple Reading Sessions through the import error contract", async () => {
    await expect(getReaderImportFormat("spl-session-json").importFile(jsonFile(archive([], [])))).rejects.toMatchObject({
      name: "ReaderImportParseError",
      code: "spl-session-empty",
    });
    const multiple = archive([], [session([]), { ...session([]), sourceReadingSessionId: "session-2" }]);
    await expect(getReaderImportFormat("spl-session-json").importFile(jsonFile(multiple))).rejects.toMatchObject({
      name: "ReaderImportParseError",
      code: "spl-session-multiple",
      action: { label: "Split export", href: "#/settings?tab=tools" },
    });
  });
});

function archive(annotations: unknown[], readingSessions = [session(annotations)]) {
  return {
    type: "SecondPassMarginaliaExport",
    schemaVersion: "0.1.0",
    profile: "https://secondpasslibrary.local/specs/marginalia/0.1.0",
    generatedAt: "2026-01-03T00:00:00Z",
    generator: "Second Pass Library",
    books: [{ title: "Book", authors: ["Author"], readingSessions }],
  };
}

function session(annotations: unknown[]) {
  return {
    sourceReadingSessionId: "session-1",
    name: "Imported Session",
    notes: "",
    status: "closed",
    startedAt: "2026-01-01T00:00:00Z",
    closedAt: "2026-01-02T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    progress: null,
    annotations,
  };
}

function bookmark(clientAnnotationId: string, location: string) {
  return {
    clientAnnotationId,
    kind: "bookmark",
    location: { location, locationLabel: "042% - Chapter" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  };
}

function highlight(clientAnnotationId: string, location: string) {
  return {
    ...bookmark(clientAnnotationId, location),
    kind: "highlight",
    body: { text: "Selected text", prefix: "Before", suffix: "After", color: "green", note: "Note" },
  };
}

function jsonFile(value: unknown, name = "session.json"): File {
  return new File([JSON.stringify(value)], name, { type: "application/json" });
}
