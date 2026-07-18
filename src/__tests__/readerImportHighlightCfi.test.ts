import { describe, expect, it, vi } from "vitest";
import { stageReaderImportHighlightCfi } from "../features/reader/imports/readerImportHighlightCfi";
import type { ReaderImportRow } from "../features/reader/imports/readerImportTypes";

describe("reader import highlight CFI staging", () => {
  it("stages a safely resolved range", async () => {
    const stageSelectionFromCfiRange = vi.fn();
    const result = await stageReaderImportHighlightCfi({
      jobId: "job-1",
      row: highlightRow(),
      probeCfi: async () => ({ ok: true, code: "exists-in-book", cfiKind: "range", rangeText: "Resolved text" }),
      displayCfi: async () => ({ ok: true, code: "displayed" }),
      stagedSelection: { stageSelectionFromCfiRange, cancelStagedSelection: vi.fn() },
    });
    expect(result).toEqual({ ok: true, code: "staged" });
    expect(stageSelectionFromCfiRange).toHaveBeenCalledWith(expect.objectContaining({
      cfiRange: "epubcfi(/6/2!/4/2,/1:0,/1:4)",
      text: "Resolved text",
      source: { kind: "import", importJobId: "job-1", importRowId: "row-1" },
    }));
  });

  it("rejects a point CFI without display or staging", async () => {
    const displayCfi = vi.fn();
    const stageSelectionFromCfiRange = vi.fn();
    const result = await stageReaderImportHighlightCfi({
      jobId: "job-1",
      row: highlightRow(),
      probeCfi: async () => ({ ok: true, code: "exists-in-book", cfiKind: "point" }),
      displayCfi,
      stagedSelection: { stageSelectionFromCfiRange, cancelStagedSelection: vi.fn() },
    });
    expect(result.ok).toBe(false);
    expect(displayCfi).not.toHaveBeenCalled();
    expect(stageSelectionFromCfiRange).not.toHaveBeenCalled();
  });

  it("keeps failed display row-local", async () => {
    const result = await stageReaderImportHighlightCfi({
      jobId: "job-1",
      row: highlightRow(),
      probeCfi: async () => ({ ok: true, code: "exists-in-book", cfiKind: "range", rangeText: "Resolved text" }),
      displayCfi: async () => ({ ok: false, code: "display-failed", error: "No display" }),
      stagedSelection: { stageSelectionFromCfiRange: vi.fn(), cancelStagedSelection: vi.fn() },
    });
    expect(result).toEqual({ ok: false, code: "stage-failed", error: "No display" });
  });
});

function highlightRow(): ReaderImportRow {
  return { id: "row-1", index: 1, kind: "highlight", quoteText: "Imported text", cfiHint: "epubcfi(/6/2!/4/2,/1:0,/1:4)", status: "pending" };
}
