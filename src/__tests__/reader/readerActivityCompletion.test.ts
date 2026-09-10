import { describe, expect, it, vi } from "vitest";
import type { SecondPassClient } from "@secondpass/client";
import { hasReachedEndOfBookPromptThreshold } from "../../features/reader/activity/ReaderActivityCompletion.Controller";
import { closeReadingSession } from "../../features/reader/session/ReadingSessionClose.Actions";

describe("Reader end-of-book completion", () => {
  it("does not trigger below 99% and triggers at the boundary", () => {
    expect(hasReachedEndOfBookPromptThreshold(0.98)).toBe(false);
    expect(hasReachedEndOfBookPromptThreshold(0.989)).toBe(false);
    expect(hasReachedEndOfBookPromptThreshold(0.99)).toBe(true);
    expect(hasReachedEndOfBookPromptThreshold(1)).toBe(true);
  });

  it("does not trigger for missing or invalid progress", () => {
    expect(hasReachedEndOfBookPromptThreshold(undefined)).toBe(false);
    expect(hasReachedEndOfBookPromptThreshold(Number.NaN)).toBe(false);
    expect(hasReachedEndOfBookPromptThreshold(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("flushes and stops progress before closing with the final progress payload", async () => {
    const calls: string[] = [];
    const update = vi.fn();
    const close = vi.fn().mockImplementation(async () => {
      calls.push("close");
    });
    const prepareProgressForClose = vi.fn().mockImplementation(async () => {
      calls.push("progress");
    });
    const spl = {
      marginalia: { sessions: { update, close } },
    } as unknown as SecondPassClient;
    const finalProgress = { cfi: "epubcfi(/6/20)", locationLabel: "098% - Chapter 10" };

    await closeReadingSession({
      spl,
      sessionId: "session-1",
      savedName: "Reading",
      savedNotes: "",
      name: "Reading",
      notes: "",
      finalProgress,
      prepareProgressForClose,
    });

    expect(calls).toEqual(["progress", "close"]);
    expect(update).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledWith("session-1", { progress: finalProgress });
  });

  it("resumes autosave when closing fails", async () => {
    const resumeProgressAfterCloseFailure = vi.fn();
    const spl = {
      marginalia: { sessions: { update: vi.fn(), close: vi.fn().mockRejectedValue(new Error("offline")) } },
    } as unknown as SecondPassClient;

    await expect(closeReadingSession({
      spl,
      sessionId: "session-1",
      savedName: "Reading",
      savedNotes: "",
      name: "Reading",
      notes: "",
      prepareProgressForClose: vi.fn(),
      resumeProgressAfterCloseFailure,
    })).rejects.toThrow("offline");

    expect(resumeProgressAfterCloseFailure).toHaveBeenCalledOnce();
  });
});
