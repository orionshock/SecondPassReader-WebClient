import type {
  MarginaliaAnnotationBatchOperation,
  MarginaliaAnnotationCollection,
} from "@secondpass/client";
import type {
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "../../storage/OfflineRepositories.Types";
import {
  mergeAuthoritativeReaderAnnotations,
  type ReaderAnnotationIntent,
} from "./OfflineReaderAnnotationReplay.State";
import {
  prepareOfflineReaderAnnotationContinuation,
  type ReaderAnnotationContinuationOutcome,
} from "./OfflineReaderAnnotationContinuation.Actions";
import {
  reconcileOfflineReaderSessionAuthority,
  type ReaderSessionAuthority,
} from "../sync/OfflineReaderSessionReconciliation.Actions";
import { classifyOfflineDeliveryFailure } from "../retry/OfflineRetry.Policy";
import { recordOfflineReaderAttemptFailure } from "../retry/OfflineReaderAttempt.Actions";
import {
  isOfflineReaderIntentEligible,
  type OfflineReaderAttemptMode,
} from "../retry/OfflineReaderRetryEligibility.Policy";
import { updateOfflineReaderBookState } from "../continuity/OfflineReaderStateWrite.Coordinator";
import {
  readerIntentResourceKey,
  type ReaderOutboxIntent,
} from "../outbox/ReaderOutbox.Policy";
import { sortReaderIntentsForReplay } from "./ReaderReplay.Policy";

const ANNOTATION_BATCH_LIMIT = 100;

// Replays annotation desired state against one authoritative Reading Session. SESSION_CLOSED
// rebases transferable work before any exact intent revision is acknowledged.

export type ReaderAnnotationReplayClient = {
  marginalia: {
    books: ReaderSessionAuthority;
    sessions: {
      batchAnnotations(
        sessionId: string,
        operations: MarginaliaAnnotationBatchOperation[],
      ): Promise<MarginaliaAnnotationCollection>;
    };
  };
};

export type OfflineReaderAnnotationReplayResult =
  | {
      status: "replayed";
      delivered: number;
      acknowledged: number;
      remaining: number;
      continuation: ReaderAnnotationContinuationOutcome | null;
    }
  | { status: "no-pending"; continuation: ReaderAnnotationContinuationOutcome | null }
  | { status: "nothing-eligible"; continuation: ReaderAnnotationContinuationOutcome | null }
  | { status: "no-local-state" }
  | { status: "retry-later"; retryAfterMs: number | null }
  | { status: "reauthenticate" }
  | { status: "refresh-authority" }
  | { status: "terminal-request" }
  | { status: "failed" };

type AnnotationReplayFailure =
  | { status: "retry-later"; retryAfterMs: number | null }
  | { status: "reauthenticate" | "refresh-authority" | "terminal-request" | "failed" };

type ReplayInput = {
  namespaceKey: string;
  bookId: string;
  serverSessionId: string;
  client: ReaderAnnotationReplayClient;
  stateRepository: OfflineReaderStateRepository;
  outboxRepository: ReaderOutboxRepository;
  generateClientId?: () => string;
  attemptMode?: OfflineReaderAttemptMode;
  now?: () => number;
};

const activeReplays = new Map<string, Promise<OfflineReaderAnnotationReplayResult>>();

export function replayOfflineReaderAnnotations(input: ReplayInput): Promise<OfflineReaderAnnotationReplayResult> {
  const namespaceKey = input.namespaceKey.trim();
  const bookId = input.bookId.trim();
  const serverSessionId = input.serverSessionId.trim();
  if (!namespaceKey || !bookId || !serverSessionId) return Promise.resolve({ status: "failed" });

  const scopeKey = JSON.stringify([namespaceKey, bookId]);
  const active = activeReplays.get(scopeKey);
  if (active) return active;
  const operation = runReplay({ ...input, namespaceKey, bookId, serverSessionId });
  activeReplays.set(scopeKey, operation);
  const clear = () => {
    if (activeReplays.get(scopeKey) === operation) activeReplays.delete(scopeKey);
  };
  void operation.then(clear, clear);
  return operation;
}

async function runReplay(input: ReplayInput): Promise<OfflineReaderAnnotationReplayResult> {
  let state: Awaited<ReturnType<OfflineReaderStateRepository["getBookState"]>>;
  try {
    state = await input.stateRepository.getBookState(input.namespaceKey, input.bookId);
  } catch {
    return { status: "failed" };
  }
  if (!state) return { status: "no-local-state" };

  const prepared = await prepareOfflineReaderAnnotationContinuation({
    ...input,
    toSessionId: input.serverSessionId,
    closedSessionId: null,
  });
  if (prepared.status !== "prepared") return { status: prepared.status };
  return deliver(input, input.serverSessionId, prepared.continuation, true);
}

async function deliver(
  input: ReplayInput,
  serverSessionId: string,
  continuation: ReaderAnnotationContinuationOutcome | null,
  mayContinue: boolean,
): Promise<OfflineReaderAnnotationReplayResult> {
  let intents: ReaderAnnotationIntent[];
  let pendingCount = 0;
  let stateAtSend: Awaited<ReturnType<OfflineReaderStateRepository["getBookState"]>>;
  try {
    const [allIntents, currentState] = await Promise.all([
      input.outboxRepository.list(input.namespaceKey),
      input.stateRepository.getBookState(input.namespaceKey, input.bookId),
    ]);
    const now = (input.now ?? Date.now)();
    const pending = annotationIntents(allIntents, input.bookId);
    pendingCount = pending.length;
    intents = pending.filter((intent) => isOfflineReaderIntentEligible({
      intent,
      mode: input.attemptMode ?? "manual",
      now,
    })).slice(0, ANNOTATION_BATCH_LIMIT);
    stateAtSend = currentState;
  } catch {
    return { status: "failed" };
  }
  if (!stateAtSend) return { status: "no-local-state" };
  if (intents.length === 0) return { status: pendingCount > 0 ? "nothing-eligible" : "no-pending", continuation };

  let response: MarginaliaAnnotationCollection;
  try {
    response = await input.client.marginalia.sessions.batchAnnotations(
      serverSessionId,
      intents.map(toBatchOperation),
    );
  } catch (error) {
    const failure = classifyReplayFailure(error);
    if (failure.status !== "session-closed") {
      await recordReplayFailure(input, intents, failure);
      return failure;
    }
    if (!mayContinue) return { status: "refresh-authority" };

    const authority = await reconcileOfflineReaderSessionAuthority({
      namespaceKey: input.namespaceKey,
      bookId: input.bookId,
      authority: input.client.marginalia.books,
      stateRepository: input.stateRepository,
      outboxRepository: input.outboxRepository,
    });
    if (authority.status !== "resolved") {
      const mapped = reconciliationFailure(authority);
      if (mapped.status !== "no-local-state") await recordReplayFailure(input, intents, mapped);
      return mapped;
    }
    const nextSessionId = authority.state.session.serverSessionId;
    if (!nextSessionId || nextSessionId === serverSessionId) {
      const failure = { status: "refresh-authority" } as const;
      await recordReplayFailure(input, intents, failure);
      return failure;
    }
    const prepared = await prepareOfflineReaderAnnotationContinuation({
      ...input,
      toSessionId: nextSessionId,
      closedSessionId: serverSessionId,
    });
    if (prepared.status !== "prepared") return { status: prepared.status };
    return deliver(input, nextSessionId, mergeContinuation(continuation, prepared.continuation), false);
  }

  if (!Array.isArray(response.annotations)) return { status: "failed" };
  let currentIntents: ReaderOutboxIntent[];
  let fallbackState: Awaited<ReturnType<OfflineReaderStateRepository["getBookState"]>>;
  try {
    [currentIntents, fallbackState] = await Promise.all([
      input.outboxRepository.list(input.namespaceKey),
      input.stateRepository.getBookState(input.namespaceKey, input.bookId),
    ]);
  } catch {
    return { status: "failed" };
  }
  if (!fallbackState) return { status: "no-local-state" };

  const pending = annotationIntents(currentIntents, input.bookId).filter((candidate) => (
    !intents.some((delivered) => sameIntentRevision(candidate, delivered))
  ));
  try {
    await updateOfflineReaderBookState({
      namespaceKey: input.namespaceKey,
      bookId: input.bookId,
      fallbackState,
      repository: input.stateRepository,
      update: (current) => ({
        ...current,
        annotations: mergeAuthoritativeReaderAnnotations({
          authoritative: response.annotations,
          serverSessionId,
          beforeRequest: stateAtSend.annotations,
          current: current.annotations,
          delivered: intents,
          pending,
        }),
      }),
    });
  } catch {
    return { status: "failed" };
  }

  let acknowledged = 0;
  try {
    for (const intent of intents) {
      // Acknowledge only the delivered revision; a newer local edit with the same resource key must survive.
      if (await input.outboxRepository.remove(
        input.namespaceKey,
        readerIntentResourceKey(intent),
        intent.intentRevision,
      )) acknowledged += 1;
    }
    const remaining = annotationIntents(await input.outboxRepository.list(input.namespaceKey), input.bookId).length;
    return { status: "replayed", delivered: intents.length, acknowledged, remaining, continuation };
  } catch {
    return { status: "failed" };
  }
}

function annotationIntents(intents: readonly ReaderOutboxIntent[], bookId: string): ReaderAnnotationIntent[] {
  return sortReaderIntentsForReplay(intents)
    .filter((intent): intent is ReaderAnnotationIntent => (
      intent.bookId === bookId
      && (intent.type === "upsert-annotation" || intent.type === "delete-annotation")
    ));
}

function toBatchOperation(intent: ReaderAnnotationIntent): MarginaliaAnnotationBatchOperation {
  return intent.type === "upsert-annotation"
    ? { action: "upsert", annotation: intent.annotation }
    : { action: "delete", clientId: intent.clientId };
}

function sameIntentRevision(left: ReaderAnnotationIntent, right: ReaderAnnotationIntent): boolean {
  return readerIntentResourceKey(left) === readerIntentResourceKey(right)
    && left.intentRevision === right.intentRevision;
}

function classifyReplayFailure(error: unknown): AnnotationReplayFailure | { status: "session-closed" } {
  const failure = classifyOfflineDeliveryFailure(error instanceof TypeError ? { kind: "network" } : error);
  switch (failure.classification) {
    case "retry-later": return { status: "retry-later", retryAfterMs: failure.retryAfterMs };
    case "reauthenticate": return { status: "reauthenticate" };
    case "refresh-authority": return { status: "refresh-authority" };
    case "session-closed": return { status: "session-closed" };
    case "terminal-request": return { status: "terminal-request" };
    case "unknown": return { status: "failed" };
  }
}

async function recordReplayFailure(
  input: ReplayInput,
  intents: readonly ReaderAnnotationIntent[],
  failure: AnnotationReplayFailure,
): Promise<void> {
  const classification = failure.status === "terminal-request" ? "terminal-request" : failure.status;
  try {
    await recordOfflineReaderAttemptFailure({
      repository: input.outboxRepository,
      intents,
      classification,
      retryAfterMs: failure.status === "retry-later" ? failure.retryAfterMs : null,
      now: (input.now ?? Date.now)(),
    });
  } catch {
    // The delivery failure remains authoritative; storage failure is normalized by the caller's next read.
  }
}

function reconciliationFailure(
  result: Awaited<ReturnType<typeof reconcileOfflineReaderSessionAuthority>>,
): AnnotationReplayFailure | { status: "no-local-state" } {
  switch (result.status) {
    case "retry-later": return result;
    case "reauthenticate": return result;
    case "refresh-authority": return result;
    case "no-local-state": return result;
    case "unavailable": return { status: "terminal-request" };
    case "failed": return result;
    case "resolved": return { status: "failed" };
  }
}

function mergeContinuation(
  previous: ReaderAnnotationContinuationOutcome | null,
  next: ReaderAnnotationContinuationOutcome | null,
): ReaderAnnotationContinuationOutcome | null {
  if (!previous) return next;
  if (!next) return previous;
  return {
    forwardedConfirmedEdits: previous.forwardedConfirmedEdits + next.forwardedConfirmedEdits,
    droppedConfirmedDeletes: previous.droppedConfirmedDeletes + next.droppedConfirmedDeletes,
    continuedLocalUpserts: previous.continuedLocalUpserts + next.continuedLocalUpserts,
    fromSessionId: previous.fromSessionId || next.fromSessionId,
    toSessionId: next.toSessionId,
  };
}
