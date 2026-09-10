import { describe, expect, it } from "vitest";
import { isReaderCfiRange } from "../features/reader/engine/ReaderCfiClassifier.Adapter";
import { readerCfi } from "./ReaderCfiTest.Fixtures";

describe("reader CFI kind", () => {
  it("recognizes a range CFI", () => {
    expect(isReaderCfiRange(readerCfi.range)).toBe(true);
  });

  it("rejects point, invalid, and missing CFIs", () => {
    expect(isReaderCfiRange(readerCfi.point)).toBe(false);
    expect(isReaderCfiRange(readerCfi.malformed)).toBe(false);
    expect(isReaderCfiRange("   ")).toBe(false);
    expect(isReaderCfiRange(undefined)).toBe(false);
  });
});
