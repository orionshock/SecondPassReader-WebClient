import { describe, expect, it } from "vitest";

import { acceptSuggestedBookmarkRow, createBookmarkSuggestion, hasOtherStagedRows, resetOtherStagedRowsForActivation, setReaderImportRowStatus } from "../features/reader/imports/readerImportJobState";
import type { ReaderImportRow } from "../features/reader/imports/readerImportTypes";

describe("reader import job state", () => {
  it("resets previously staged rows when a different row is activated", () => {
    const rows = [
      row({ id: "staged", status: "staged" }),
      row({ id: "next", status: "pending" }),
      row({ id: "accepted", status: "accepted" }),
    ];

    expect(resetOtherStagedRowsForActivation(rows, "next").map((item) => [item.id, item.status])).toEqual([
      ["staged", "pending"],
      ["next", "pending"],
      ["accepted", "accepted"],
    ]);
  });

  it("keeps the active staged row staged when reactivated", () => {
    const rows = [row({ id: "staged", status: "staged" }), row({ id: "other", status: "pending" })];

    expect(resetOtherStagedRowsForActivation(rows, "staged").map((item) => [item.id, item.status])).toEqual([
      ["staged", "staged"],
      ["other", "pending"],
    ]);
  });

  it("detects other staged rows for staged selection cleanup", () => {
    const rows = [row({ id: "staged", status: "staged" }), row({ id: "next", status: "pending" })];

    expect(hasOtherStagedRows(rows, "next")).toBe(true);
    expect(hasOtherStagedRows(rows, "staged")).toBe(false);
  });

  it("creates a suggestion for a staged bookmark", () => {
    expect(createBookmarkSuggestion("job-1", row({ id: "bookmark", kind: "bookmark", status: "staged", cfiHint: " epubcfi(/6/2) " }))).toEqual({
      jobId: "job-1",
      rowId: "bookmark",
      cfi: "epubcfi(/6/2)",
    });
  });

  it("marks only the suggested bookmark row accepted after bookmark success", () => {
    const rows = [row({ id: "bookmark", kind: "bookmark", status: "staged" }), row({ id: "other", status: "pending" })];
    const result = acceptSuggestedBookmarkRow(rows, { jobId: "job-1", rowId: "bookmark", cfi: "epubcfi(/6/2)" });
    expect(result.map((item) => [item.id, item.status])).toEqual([["bookmark", "accepted"], ["other", "pending"]]);
  });

  it.each(["pending", "searching", "accepted", "skipped", "not-found"] as const)(
    "clears candidate metadata when a row becomes %s",
    (status) => {
      const result = setReaderImportRowStatus(row({
        status: "staged",
        candidateIndex: 3,
        candidateCount: 25,
      }), status);

      expect(result).not.toHaveProperty("candidateIndex");
      expect(result).not.toHaveProperty("candidateCount");
    },
  );
});

function row(overrides: Partial<ReaderImportRow>): ReaderImportRow {
  return {
    id: "row",
    kind: "highlight",
    index: 1,
    quoteText: "Text",
    status: "pending",
    ...overrides,
  };
}
