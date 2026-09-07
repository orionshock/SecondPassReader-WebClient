import { describe, expect, it } from "vitest";
import { buildReadingSessionAutosaveStatus } from "../features/reader/session/progress/ReadingSessionProgress.Presenter";

describe("reading session progress presentation", () => {
  it("omits status when no reading session exists", () => {
    expect(buildReadingSessionAutosaveStatus({
      sessionId: null,
      status: "idle",
      nowMs: 1000,
    })).toBeNull();
  });

  it("rounds the pending countdown up rather than implying an early save", () => {
    expect(buildReadingSessionAutosaveStatus({
      sessionId: "session-1",
      status: "pending",
      nextSaveAt: 2001,
      nowMs: 1000,
    })).toEqual({ text: "Autosave: waiting (2s)" });
  });

  it("distinguishes an in-flight save from a confirmed save", () => {
    expect(buildReadingSessionAutosaveStatus({
      sessionId: "session-1",
      status: "saving",
      nowMs: 1000,
    })).toEqual({ text: "Autosave: sending" });
    expect(buildReadingSessionAutosaveStatus({
      sessionId: "session-1",
      status: "saved",
      nowMs: 1000,
    })).toEqual({ text: "Autosave: complete", title: undefined });
  });

  it("distinguishes error and closed states without claiming a completed save", () => {
    const error = buildReadingSessionAutosaveStatus({
      sessionId: "session-1",
      status: "error",
      nowMs: 1000,
    });
    const closed = buildReadingSessionAutosaveStatus({
      sessionId: "session-1",
      status: "closed",
      nowMs: 1000,
    });

    expect(error?.text).not.toContain("complete");
    expect(closed?.text).not.toContain("complete");
    expect(closed?.text).toContain("closed");
    expect(error).not.toEqual(closed);
  });
});
