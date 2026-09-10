import type { OfflineReaderCoordinatedSyncResult } from "../OfflineReaderCoordinatedSync.Actions";

export type OfflineReaderPendingSyncOutcome = {
  completedBooks: number;
  partiallySyncedBooks: number;
  busyBooks: number;
  retryLaterBooks: number;
  reauthenticateBooks: number;
  refreshAuthorityBooks: number;
  terminalBooks: number;
  failedBooks: number;
  continuationBooks: number;
  meaningfulOutcomeBooks: number;
  forwardedConfirmedEdits: number;
  droppedConfirmedDeletes: number;
  continuedLocalUpserts: number;
};

export function createOfflineReaderSyncOutcome(): OfflineReaderPendingSyncOutcome {
  return {
    completedBooks: 0,
    partiallySyncedBooks: 0,
    busyBooks: 0,
    retryLaterBooks: 0,
    reauthenticateBooks: 0,
    refreshAuthorityBooks: 0,
    terminalBooks: 0,
    failedBooks: 0,
    continuationBooks: 0,
    meaningfulOutcomeBooks: 0,
    forwardedConfirmedEdits: 0,
    droppedConfirmedDeletes: 0,
    continuedLocalUpserts: 0,
  };
}

export function addOfflineReaderSyncBookOutcome(
  current: OfflineReaderPendingSyncOutcome,
  result: OfflineReaderCoordinatedSyncResult,
): OfflineReaderPendingSyncOutcome {
  const next = { ...current };
  if (result.status === "busy") {
    next.busyBooks += 1;
    return next;
  }
  if (result.status !== "completed") {
    next.failedBooks += 1;
    return next;
  }

  const sync = result.sync;
  if (sync.status === "synced" || sync.status === "nothing-to-sync") next.completedBooks += 1;
  else if (sync.status === "partially-synced") next.partiallySyncedBooks += 1;

  const failure = sync.status === "partially-synced" ? sync.failure.status : sync.status;
  if (failure === "retry-later") next.retryLaterBooks += 1;
  else if (failure === "reauthenticate") next.reauthenticateBooks += 1;
  else if (failure === "refresh-authority") next.refreshAuthorityBooks += 1;
  else if (failure === "terminal") next.terminalBooks += 1;
  else if (failure === "failed") next.failedBooks += 1;

  const terminal = failure === "terminal";
  if ((sync.status !== "synced" && sync.status !== "partially-synced") || !sync.continuation) {
    if (terminal) next.meaningfulOutcomeBooks += 1;
    return next;
  }

  const continuation = sync.continuation;
  next.continuationBooks += 1;
  next.forwardedConfirmedEdits += continuation.forwardedConfirmedEdits;
  next.droppedConfirmedDeletes += continuation.droppedConfirmedDeletes;
  next.continuedLocalUpserts += continuation.continuedLocalUpserts;
  if (terminal || continuation.forwardedConfirmedEdits > 0 || continuation.droppedConfirmedDeletes > 0) {
    next.meaningfulOutcomeBooks += 1;
  }
  return next;
}
