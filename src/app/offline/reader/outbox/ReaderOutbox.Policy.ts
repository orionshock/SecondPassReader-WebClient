import type {
  MarginaliaBookmarkUpsert,
  MarginaliaHighlightUpsert,
} from "@secondpass/client";

type ReaderIntentScope = {
  namespaceKey: string;
  bookId: string;
};

type SessionTarget = {
  serverSessionId: string | null;
};

type MutableReaderIntent = {
  intentRevision: number;
};

export type ReaderOutboxAttemptClassification =
  | "retry-later"
  | "reauthenticate"
  | "refresh-authority"
  | "terminal-request"
  | "failed";

export type ReaderOutboxAttempt = {
  revision: number | null;
  classification: ReaderOutboxAttemptClassification;
  attemptCount: number;
  attemptedAt: number;
  retryEligibleAt: number | null;
};

type AttemptedReaderIntent = { attempt?: ReaderOutboxAttempt };

export type ReaderAnnotationOrigin =
  | { kind: "local-unconfirmed" }
  | { kind: "server-confirmed"; serverSessionId: string };

export type EstablishReaderSessionIntent = ReaderIntentScope & AttemptedReaderIntent & {
  type: "establish-session";
};

export type ReplaceReaderProgressIntent = ReaderIntentScope & SessionTarget & MutableReaderIntent & AttemptedReaderIntent & {
  type: "replace-progress";
  progress: {
    cfi: string;
    percentage: number | null;
    locationLabel: string;
  };
};

export type UpsertReaderAnnotationIntent = ReaderIntentScope & SessionTarget & MutableReaderIntent & AttemptedReaderIntent & {
  type: "upsert-annotation";
  origin: ReaderAnnotationOrigin;
  annotation: MarginaliaHighlightUpsert | MarginaliaBookmarkUpsert;
};

export type DeleteReaderAnnotationIntent = ReaderIntentScope & SessionTarget & MutableReaderIntent & AttemptedReaderIntent & {
  type: "delete-annotation";
  origin: ReaderAnnotationOrigin;
  clientId: string;
};

export type ReaderOutboxIntent =
  | EstablishReaderSessionIntent
  | ReplaceReaderProgressIntent
  | UpsertReaderAnnotationIntent
  | DeleteReaderAnnotationIntent;

export type ClosedSessionReaderIntentOutcome =
  | { action: "resolve-with-open" }
  | { action: "transfer" }
  | { action: "drop"; reason: "confirmed-delete" | "local-unconfirmed-delete" };

export function readerIntentResourceKey(intent: ReaderOutboxIntent): string {
  const scope = [intent.namespaceKey, intent.bookId];
  if (intent.type === "establish-session") return JSON.stringify([...scope, "session"]);
  if (intent.type === "replace-progress") {
    return JSON.stringify([...scope, intent.serverSessionId, "progress"]);
  }

  const clientId = intent.type === "upsert-annotation"
    ? intent.annotation.clientId
    : intent.clientId;
  return JSON.stringify([...scope, intent.serverSessionId, "annotation", clientId]);
}

export function coalesceReaderIntent(
  existing: readonly ReaderOutboxIntent[],
  incoming: ReaderOutboxIntent,
): ReaderOutboxIntent[] {
  const cleanIncoming = withoutReaderIntentAttempt(incoming);
  const resourceKey = readerIntentResourceKey(cleanIncoming);
  const existingIndex = existing.findIndex(
    (intent) => readerIntentResourceKey(intent) === resourceKey,
  );

  if (cleanIncoming.type === "delete-annotation" && cleanIncoming.origin.kind === "local-unconfirmed") {
    const matching = existingIndex < 0 ? null : existing[existingIndex];
    if (matching?.type !== "upsert-annotation" || matching.origin.kind !== "local-unconfirmed") {
      return [...existing];
    }
    return existing.filter((_intent, index) => index !== existingIndex);
  }

  if (existingIndex < 0) return [...existing, cleanIncoming];
  return existing.map((intent, index) => {
    if (index !== existingIndex) return intent;
    return readerIntentRevision(intent) === readerIntentRevision(cleanIncoming) && intent.attempt
      ? { ...cleanIncoming, attempt: intent.attempt }
      : cleanIncoming;
  });
}

export function readerIntentRevision(intent: ReaderOutboxIntent): number | null {
  return "intentRevision" in intent ? intent.intentRevision : null;
}

export function withoutReaderIntentAttempt(intent: ReaderOutboxIntent): ReaderOutboxIntent {
  const { attempt: _attempt, ...clean } = intent;
  return clean as ReaderOutboxIntent;
}

export function classifyClosedSessionReaderIntent(
  intent: ReaderOutboxIntent,
): ClosedSessionReaderIntentOutcome {
  if (intent.type === "establish-session") return { action: "resolve-with-open" };
  if (intent.type === "replace-progress" || intent.type === "upsert-annotation") {
    return { action: "transfer" };
  }

  return {
    action: "drop",
    reason: intent.origin.kind === "server-confirmed"
      ? "confirmed-delete"
      : "local-unconfirmed-delete",
  };
}

export function isReaderIntentTransferableAfterSessionClosed(intent: ReaderOutboxIntent): boolean {
  return classifyClosedSessionReaderIntent(intent).action === "transfer";
}
