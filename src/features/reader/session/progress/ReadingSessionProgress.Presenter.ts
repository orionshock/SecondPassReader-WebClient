import type { ReadingProgressAutosaveStatus } from "./ReadingProgressAutosave.Controller";

export type ReadingSessionAutosaveStatus = {
  text: string;
  title?: string;
};

export function buildReadingSessionAutosaveStatus(input: {
  sessionId: string | null;
  status: ReadingProgressAutosaveStatus;
  lastSavedAt?: string;
  nextSaveAt?: number;
  nowMs: number;
}): ReadingSessionAutosaveStatus | null {
  if (!input.sessionId) return null;

  const lastSavedTitle =
    input.lastSavedAt && !Number.isNaN(Date.parse(input.lastSavedAt))
      ? `Last saved: ${new Date(input.lastSavedAt).toLocaleString()}`
      : undefined;

  switch (input.status) {
    case "saving":
      return { text: "Autosave: sending" };
    case "saved":
      return { text: "Autosave: complete", title: lastSavedTitle };
    case "pending":
    case "idle":
      if (typeof input.nextSaveAt === "number") {
        const remaining = Math.max(0, input.nextSaveAt - input.nowMs);
        const seconds = Math.max(0, Math.ceil(remaining / 1000));
        return { text: `Autosave: waiting (${seconds}s)` };
      }
      return { text: "Autosave: waiting" };
    case "error":
      return { text: "Autosave: waiting" };
    case "closed":
      return { text: "Autosave: session closed" };
  }
}
