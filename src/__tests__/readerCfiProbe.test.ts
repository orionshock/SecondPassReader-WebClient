import { describe, expect, it } from "vitest";
import { probeReaderCfi } from "../features/reader/shell/ReaderCfiProbe.Adapter";
import { readerCfi } from "./ReaderCfiTest.Fixtures";

describe("probeReaderCfi", () => {
  it("returns ok probe results", async () => {
    const result = await probeReaderCfi(async (cfi) => ({
      ok: true,
      code: "exists-in-book",
      description: cfi,
    }), ` ${readerCfi.point} `);

    expect(result).toEqual({ ok: true, code: "exists-in-book", description: readerCfi.point });
  });

  it("maps probe failures to ok false instead of throwing", async () => {
    const result = await probeReaderCfi(async () => {
      throw new Error("Invalid CFI");
    }, readerCfi.malformed);

    expect(result).toEqual({ ok: false, code: "resolution-failed", error: "Invalid CFI" });
  });

  it("rejects empty CFI input as a local probe result", async () => {
    const result = await probeReaderCfi(async () => {
      throw new Error("should not be called");
    }, " ");

    expect(result).toEqual({ ok: false, code: "invalid", error: "CFI is required." });
  });
});
