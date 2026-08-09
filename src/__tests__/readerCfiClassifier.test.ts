import { describe, expect, it } from "vitest";
import { isReaderCfiRange } from "../features/reader/engine/ReaderCfiClassifier.Engine";

describe("reader CFI kind", () => {
  it("recognizes a range CFI", () => {
    expect(isReaderCfiRange("epubcfi(/6/2!/4/2,/1:0,/1:4)")).toBe(true);
  });

  it("rejects point, invalid, and missing CFIs", () => {
    expect(isReaderCfiRange("epubcfi(/6/2!/4/2/1:0)")).toBe(false);
    expect(isReaderCfiRange("not-a-cfi")).toBe(false);
    expect(isReaderCfiRange("   ")).toBe(false);
    expect(isReaderCfiRange(undefined)).toBe(false);
  });
});
