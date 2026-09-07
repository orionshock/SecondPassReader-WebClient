import { describe, expect, it } from "vitest";
import { displayReaderCfiSafely } from "../features/reader/shell/ReaderCfiDisplay.Adapter";
import { readerCfi } from "./ReaderCfiTest.Fixtures";

describe("safe reader CFI display", () => {
  it("maps display success to ok true", async () => {
    await expect(displayReaderCfiSafely(async () => ({ ok: true, code: "displayed" }), ` ${readerCfi.point} `)).resolves.toEqual({
      ok: true,
      code: "displayed",
    });
  });

  it("maps rejected display to ok false", async () => {
    await expect(displayReaderCfiSafely(async () => { throw new Error("Display exploded"); }, readerCfi.point)).resolves.toEqual({
      ok: false,
      code: "display-failed",
      error: "Display exploded",
    });
  });
});
