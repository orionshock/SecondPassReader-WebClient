import type { OfflineReaderPendingSyncResult } from "../OfflineReaderPendingSync.Actions";

export type OfflineReaderSyncNotice = {
  kind: "continuation" | "terminal-pending" | "continuation-and-terminal";
  severity: "info" | "warning";
  message: string;
  forwardedEdits: number;
  droppedDeletes: number;
  terminalBooks: number;
  affectedBooks: number;
};

export function presentOfflineReaderSyncNotice(
  result: OfflineReaderPendingSyncResult,
): OfflineReaderSyncNotice | null {
  if (result.status !== "completed") return null;

  const { outcome } = result;
  const hasContinuation = outcome.forwardedConfirmedEdits > 0 || outcome.droppedConfirmedDeletes > 0;
  const hasTerminal = outcome.terminalBooks > 0;
  if (!hasContinuation && !hasTerminal) return null;

  const messages: string[] = [];
  if (outcome.forwardedConfirmedEdits > 0) {
    messages.push(
      `${counted(outcome.forwardedConfirmedEdits, "annotation edit was", "annotation edits were")} moved to your current reading session because the previous session had already closed.`,
    );
  }
  if (outcome.droppedConfirmedDeletes > 0) {
    messages.push(
      `${counted(outcome.droppedConfirmedDeletes, "annotation deletion couldn't", "annotation deletions couldn't")} be applied because the original reading session had already closed.`,
    );
  }
  if (hasTerminal) {
    messages.push("Some offline changes couldn't be synced and are still saved on this device.");
  }

  return {
    kind: hasContinuation && hasTerminal
      ? "continuation-and-terminal"
      : hasTerminal ? "terminal-pending" : "continuation",
    severity: outcome.droppedConfirmedDeletes > 0 || hasTerminal ? "warning" : "info",
    message: messages.join(" "),
    forwardedEdits: outcome.forwardedConfirmedEdits,
    droppedDeletes: outcome.droppedConfirmedDeletes,
    terminalBooks: outcome.terminalBooks,
    affectedBooks: outcome.meaningfulOutcomeBooks,
  };
}

function counted(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
