import { describe, expect, it } from "vitest";
import { probeReaderCfi } from "../features/reader/shell/readerCfiProbe";

describe("probeReaderCfi", () => {
  it("returns ok probe results", async () => {
    const result = await probeReaderCfi(async (cfi) => ({
      ok: true,
      code: "exists-in-book",
      description: cfi,
    }), " epubcfi(/6/2) ");

    expect(result).toEqual({ ok: true, code: "exists-in-book", description: "epubcfi(/6/2)" });
  });

  it("maps probe failures to ok false instead of throwing", async () => {
    const result = await probeReaderCfi(async () => {
      throw new Error("Invalid CFI");
    }, "bad-cfi");

    expect(result).toEqual({ ok: false, code: "resolution-failed", error: "Invalid CFI" });
  });

  it("rejects empty CFI input as a local probe result", async () => {
    const result = await probeReaderCfi(async () => {
      throw new Error("should not be called");
    }, " ");

    expect(result).toEqual({ ok: false, code: "invalid", error: "CFI is required." });
  });
});
