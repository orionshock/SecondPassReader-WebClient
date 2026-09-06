import { describe, expect, it, vi } from "vitest";
import type { SecondPassClient } from "@secondpass/client";
import { hasReachedEndOfBookPromptThreshold } from "../features/reader/activity/ReaderActivityCompletion.Controller";
import { closeReadingSession } from "../features/reader/session/ReadingSessionClose.Actions";

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

  it("keeps explicit close behavior and its final progress payload unchanged", async () => {
    const update = vi.fn();
    const close = vi.fn().mockResolvedValue(undefined);
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
    });

    expect(update).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledWith("session-1", { progress: finalProgress });
  });
});