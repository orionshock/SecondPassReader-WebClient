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

export type ReaderAnnotationOrigin =
  | { kind: "local-unconfirmed" }
  | { kind: "server-confirmed"; serverSessionId: string };

export type EstablishReaderSessionIntent = ReaderIntentScope & {
  type: "establish-session";
};

export type ReplaceReaderProgressIntent = ReaderIntentScope & SessionTarget & MutableReaderIntent & {
  type: "replace-progress";
  progress: {
    cfi: string;
    percentage: number | null;
    locationLabel: string;
  };
};

export type UpsertReaderAnnotationIntent = ReaderIntentScope & SessionTarget & MutableReaderIntent & {
  type: "upsert-annotation";
  origin: ReaderAnnotationOrigin;
  annotation: MarginaliaHighlightUpsert | MarginaliaBookmarkUpsert;
};

export type DeleteReaderAnnotationIntent = ReaderIntentScope & SessionTarget & MutableReaderIntent & {
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
  const resourceKey = readerIntentResourceKey(incoming);
  const existingIndex = existing.findIndex(
    (intent) => readerIntentResourceKey(intent) === resourceKey,
  );

  if (incoming.type === "delete-annotation" && incoming.origin.kind === "local-unconfirmed") {
    const matching = existingIndex < 0 ? null : existing[existingIndex];
    if (matching?.type !== "upsert-annotation" || matching.origin.kind !== "local-unconfirmed") {
      return [...existing];
    }
    return existing.filter((_intent, index) => index !== existingIndex);
  }

  if (existingIndex < 0) return [...existing, incoming];
  return existing.map((intent, index) => index === existingIndex ? incoming : intent);
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
