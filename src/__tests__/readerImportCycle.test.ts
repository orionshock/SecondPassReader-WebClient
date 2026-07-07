import { describe, expect, it } from "vitest";

import { getNextImportCycleMatch } from "../features/reader/imports/readerImportCycle";

describe("reader import cycle state", () => {
  it("uses the first available result on first activation", () => {
    expect(getNextImportCycleMatch({}, [[], ["a"]])).toMatchObject({
      attemptIndex: 1,
      resultIndex: 0,
      result: "a",
      nextAttemptCursor: 2,
      nextResultCursor: 0,
      hasMatched: true,
    });
  });

  it("advances to the next result from the same attempt", () => {
    expect(getNextImportCycleMatch({ attemptCursor: 0, resultCursor: 1, hasMatched: true }, [["a", "b"]])).toMatchObject({
      attemptIndex: 0,
      resultIndex: 1,
      result: "b",
      nextAttemptCursor: 1,
      nextResultCursor: 0,
      hasMatched: true,
    });
  });

  it("wraps to the first found result after exhausting prior matches", () => {
    expect(getNextImportCycleMatch({ attemptCursor: 2, resultCursor: 0, hasMatched: true }, [["a"], ["b"]])).toMatchObject({
      attemptIndex: 0,
      resultIndex: 0,
      result: "a",
    });
  });

  it("returns null when no attempt has any result", () => {
    expect(getNextImportCycleMatch({}, [[], []])).toBeNull();
  });
});
