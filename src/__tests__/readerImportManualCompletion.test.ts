import { describe, expect, it, vi } from "vitest";

import { completeReaderImportRowManually } from "../features/reader/imports/ReaderImportManualCompletion.Actions";
import {
  readerImportRow as row,
  reviewableImportStatuses,
  terminalImportStatuses,
} from "./ReaderImportTest.Fixtures";

describe("reader import manual completion", () => {
  it("clears staged review state and records only the local manual-completion transition", () => {
    const cancelStagedSelection = vi.fn();
    const clearTemporaryHighlight = vi.fn();
    const markRowManuallyCompleted = vi.fn();

    const completed = completeReaderImportRowManually({
      row: row({ status: "staged", candidateIndex: 2, candidateCount: 4 }),
      cancelStagedSelection,
      clearTemporaryHighlight,
      markRowManuallyCompleted,
    });

    expect(completed).toBe(true);
    expect(cancelStagedSelection).toHaveBeenCalledOnce();
    expect(clearTemporaryHighlight).toHaveBeenCalledOnce();
    expect(markRowManuallyCompleted).toHaveBeenCalledWith("row-1");
  });

  it.each(reviewableImportStatuses)("manually completes a %s row without clearing unrelated reader state", (status) => {
    const cancelStagedSelection = vi.fn();
    const clearTemporaryHighlight = vi.fn();
    const markRowManuallyCompleted = vi.fn();

    const completed = completeReaderImportRowManually({
      row: row({ status }),
      cancelStagedSelection,
      clearTemporaryHighlight,
      markRowManuallyCompleted,
    });

    expect(completed).toBe(true);
    expect(cancelStagedSelection).not.toHaveBeenCalled();
    expect(clearTemporaryHighlight).not.toHaveBeenCalled();
    expect(markRowManuallyCompleted).toHaveBeenCalledWith("row-1");
  });

  it.each(terminalImportStatuses)(
    "does not manually complete a %s row",
    (status) => {
      const markRowManuallyCompleted = vi.fn();
      const completed = completeReaderImportRowManually({
        row: row({ status }),
        cancelStagedSelection: vi.fn(),
        clearTemporaryHighlight: vi.fn(),
        markRowManuallyCompleted,
      });

      expect(completed).toBe(false);
      expect(markRowManuallyCompleted).not.toHaveBeenCalled();
    },
  );
});
