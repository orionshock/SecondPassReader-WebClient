import { describe, expect, it, vi } from "vitest";
import { stabilizeReaderReflow } from "../features/reader/shell/ReaderReflow.Coordinator";

describe("reader reflow stabilization", () => {
  it("refreshes marks after reflow and re-anchors afterward", async () => {
    const calls: string[] = [];

    await stabilizeReaderReflow({
      reflow: async () => {
        calls.push("apply-settings");
        await Promise.resolve();
        calls.push("redisplay-complete");
      },
      refreshMarks: () => calls.push("refresh-marks"),
      reanchorStagedToolbar: async () => {
        calls.push("reanchor-toolbar");
      },
    });

    expect(calls).toEqual([
      "apply-settings",
      "redisplay-complete",
      "refresh-marks",
      "reanchor-toolbar",
    ]);
  });

  it("keeps re-anchor measurement failure recoverable", async () => {
    const refreshMarks = vi.fn();
    const stagedSelection = { cfiRange: "epubcfi(/6/2!/4/2,/1:0,/1:4)" };

    await expect(stabilizeReaderReflow({
      reflow: async () => undefined,
      refreshMarks,
      reanchorStagedToolbar: async () => {
        throw new Error("range is not currently measurable");
      },
    })).resolves.toBeUndefined();

    expect(refreshMarks).toHaveBeenCalledOnce();
    expect(stagedSelection.cfiRange).toBe("epubcfi(/6/2!/4/2,/1:0,/1:4)");
  });

  it("does not hide actual reflow or mark-refresh failures", async () => {
    const reflowError = new Error("reflow failed");
    await expect(stabilizeReaderReflow({
      reflow: async () => { throw reflowError; },
      refreshMarks: vi.fn(),
      reanchorStagedToolbar: vi.fn(),
    })).rejects.toBe(reflowError);

    const refreshError = new Error("refresh failed");
    await expect(stabilizeReaderReflow({
      reflow: async () => undefined,
      refreshMarks: () => { throw refreshError; },
      reanchorStagedToolbar: vi.fn(),
    })).rejects.toBe(refreshError);
  });
});
