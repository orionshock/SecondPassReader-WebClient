import { describe, expect, it } from "vitest";

import { getImportCycleCandidatePosition, getNextImportCycleMatch } from "../../../features/reader/imports/ReaderImportCycle.State";

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

  it("reports the current position across the final cycleable result lists", () => {
    expect(getImportCycleCandidatePosition(
      { attemptIndex: 1, resultIndex: 1 },
      [["a"], ["b", "c"], ["d"]],
    )).toEqual({ candidateIndex: 3, candidateCount: 4 });
  });

  it("omits position metadata for a single candidate", () => {
    expect(getImportCycleCandidatePosition({ attemptIndex: 0, resultIndex: 0 }, [["a"]])).toBeNull();
  });
});
