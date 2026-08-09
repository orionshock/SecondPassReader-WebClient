import { describe, expect, it } from "vitest";

import { acceptSuggestedBookmarkRow, createBookmarkSuggestion, getReaderImportJobCounts, hasOtherStagedRows, isReaderImportRowResolved, isReaderImportRowTerminal, resetOtherStagedRowsForActivation, resetStagedRowsForNavigation, setReaderImportRowStatus, undoReaderImportManualCompletion } from "../features/reader/imports/readerImportJobState";
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

  it("returns staged rows to pending on navigation without changing terminal rows", () => {
    const rows = [
      row({ id: "staged", status: "staged", candidateIndex: 3, candidateCount: 25 }),
      row({ id: "accepted", status: "accepted" }),
      row({ id: "skipped", status: "skipped" }),
    ];

    const result = resetStagedRowsForNavigation(rows);

    expect(result.map((item) => [item.id, item.status])).toEqual([
      ["staged", "pending"],
      ["accepted", "accepted"],
      ["skipped", "skipped"],
    ]);
    expect(result[0]).not.toHaveProperty("candidateIndex");
    expect(result[0]).not.toHaveProperty("candidateCount");
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

  it.each(["pending", "searching", "accepted", "skipped", "not-found", "manually-completed"] as const)(
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

  it("treats manual completion as terminal and not-found as resolved but retryable", () => {
    expect(isReaderImportRowTerminal("manually-completed")).toBe(true);
    expect(isReaderImportRowResolved("manually-completed")).toBe(true);
    expect(isReaderImportRowTerminal("not-found")).toBe(false);
    expect(isReaderImportRowResolved("not-found")).toBe(true);
  });

  it("reopens only manually completed rows as pending", () => {
    expect(undoReaderImportManualCompletion(row({ status: "manually-completed" })).status).toBe("pending");

    const accepted = row({ status: "accepted" });
    expect(undoReaderImportManualCompletion(accepted)).toBe(accepted);
  });

  it("counts manually completed rows as resolved without counting them as pending or accepted", () => {
    const counts = getReaderImportJobCounts([
      row({ id: "pending", status: "pending" }),
      row({ id: "accepted", status: "accepted" }),
      row({ id: "manual-highlight", status: "manually-completed" }),
      row({ id: "manual-bookmark", kind: "bookmark", status: "manually-completed" }),
    ]);

    expect(counts).toEqual({
      pending: 1,
      accepted: 1,
      skipped: 0,
      notFound: 0,
      manuallyCompleted: 2,
    });
  });
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
