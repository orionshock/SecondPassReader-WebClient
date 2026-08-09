import { describe, expect, it } from "vitest";
import { toReaderImportRangeRepairDebugData } from "../features/reader/imports/ReaderRangeRepairDebug.Adapter";

describe("reader range-repair import debug adapter", () => {
  it("keeps verbose-only range-repair previews out of compact diagnostics", () => {
    const diagnostic = {
      event: "range repair failed" as const,
      data: { reason: "full text not found near fragment" },
      previews: [
        { key: "fragmentPreview", value: "fragment" },
        { key: "anchorContextPreview", value: "surrounding context", verboseOnly: true },
      ],
    };

    expect(toReaderImportRangeRepairDebugData(diagnostic, false)).toEqual({
      reason: "full text not found near fragment",
      fragmentPreview: "fragment",
    });
    expect(toReaderImportRangeRepairDebugData(diagnostic, true)).toEqual({
      reason: "full text not found near fragment",
      fragmentPreview: "fragment",
      anchorContextPreview: "surrounding context",
    });
  });

  it("uses the supplied verbose mode for ordinary preview length", () => {
    const value = "x".repeat(140);
    const diagnostic = {
      event: "range repair start" as const,
      previews: [{ key: "fullPreview", value }],
    };

    expect(toReaderImportRangeRepairDebugData(diagnostic, false)?.fullPreview).toBe(`${"x".repeat(120)}...`);
    expect(toReaderImportRangeRepairDebugData(diagnostic, true)?.fullPreview).toBe(value);
  });
});
