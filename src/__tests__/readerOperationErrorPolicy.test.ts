import { describe, expect, it } from "vitest";
import { classifyReaderOperationError } from "../features/reader/shell/ReaderOperationError.Policy";

describe("reader operation error policy", () => {
  it("keeps engine initialization failures fatal", () => {
    expect(classifyReaderOperationError("initialization", false)).toBe("fatal");
    expect(classifyReaderOperationError("initialization", true)).toBe("fatal");
  });

  it("keeps display failure fatal until a readable viewport exists", () => {
    expect(classifyReaderOperationError("display", false)).toBe("fatal");
  });

  it("makes display failure recoverable after a readable viewport exists", () => {
    expect(classifyReaderOperationError("display", true)).toBe("recoverable");
  });

  it.each(["reflow", "navigation", "search-result"] as const)(
    "classifies post-startup %s failure as recoverable",
    (kind) => {
      expect(classifyReaderOperationError(kind, true)).toBe("recoverable");
    },
  );
});
