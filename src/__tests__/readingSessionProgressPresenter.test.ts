import { describe, expect, it } from "vitest";
import { buildReadingSessionAutosaveStatus } from "../features/reader/session/progress/ReadingSessionProgress.Presenter";

describe("reading session progress presentation", () => {
  it("preserves autosave status labels and rounds the pending countdown up", () => {
    expect(buildReadingSessionAutosaveStatus({
      sessionId: null,
      status: "idle",
      nowMs: 1000,
    })).toBeNull();
    expect(buildReadingSessionAutosaveStatus({
      sessionId: "session-1",
      status: "pending",
      nextSaveAt: 2001,
      nowMs: 1000,
    })).toEqual({ text: "Autosave: waiting (2s)" });
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
    expect(buildReadingSessionAutosaveStatus({
      sessionId: "session-1",
      status: "error",
      nowMs: 1000,
    })).toEqual({ text: "Autosave: waiting" });
  });
});
