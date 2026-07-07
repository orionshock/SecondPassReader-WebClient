import { describe, expect, it } from "vitest";
import { probeReaderCfi } from "../features/reader/shell/readerCfiProbe";

describe("probeReaderCfi", () => {
  it("maps a valid CFI description to ok", async () => {
    const result = await probeReaderCfi(async (cfi) => ({
      cfi,
      href: "chapter-1.xhtml",
      spineIndex: 2,
      bookProgress: 0.25,
    }), " epubcfi(/6/2) ");

    expect(result).toEqual({ ok: true, description: "chapter-1.xhtml" });
  });

  it("maps probe failures to ok false instead of throwing", async () => {
    const result = await probeReaderCfi(async () => {
      throw new Error("Invalid CFI");
    }, "bad-cfi");

    expect(result).toEqual({ ok: false, error: "Invalid CFI" });
  });

  it("rejects empty CFI input as a local probe result", async () => {
    const result = await probeReaderCfi(async () => {
      throw new Error("should not be called");
    }, " ");

    expect(result).toEqual({ ok: false, error: "CFI is required." });
  });
});
