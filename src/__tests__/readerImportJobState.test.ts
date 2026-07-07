import { describe, expect, it } from "vitest";

import { hasOtherStagedRows, resetOtherStagedRowsForActivation } from "../features/reader/imports/readerImportJobState";
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
