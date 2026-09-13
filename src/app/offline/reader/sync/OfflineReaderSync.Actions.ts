import type {
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "../../storage/OfflineRepositories.Types";
import {
  replayOfflineReaderAnnotations,
  type OfflineReaderAnnotationReplayResult,
  type ReaderAnnotationReplayClient,
} from "../replay/OfflineReaderAnnotationReplay.Actions";
import type { ReaderAnnotationContinuationOutcome } from "../replay/OfflineReaderAnnotationContinuation.Actions";
import type { ReaderAnnotationContinuationRepository } from "../replay/OfflineReaderAnnotationContinuation.Actions";
import {
  replayOfflineReaderProgress,
  type OfflineReaderProgressReplayResult,
  type ReaderProgressReplayClient,
} from "../replay/OfflineReaderProgressReplay.Actions";
import {
  reconcileOfflineReaderSessionAuthority,
  type OfflineReaderSessionReconciliationResult,
} from "./OfflineReaderSessionReconciliation.Actions";
import type { ReaderOutboxIntent } from "../outbox/ReaderOutbox.Policy";
import { recordOfflineReaderAttemptFailure } from "../retry/OfflineReaderAttempt.Actions";
import {
  isOfflineReaderIntentEligible,
  offlineReaderRetryEligibility,
  type OfflineReaderAttemptMode,
} from "../retry/OfflineReaderRetryEligibility.Policy";

export type OfflineReaderSyncClient = ReaderAnnotationReplayClient & ReaderProgressReplayClient;

type SyncStage = "authority" | "annotations" | "progress";

type SyncFailure =
  | { status: "retry-later"; retryAfterMs: number | null }
  | { status: "reauthenticate" }
  | { status: "refresh-authority" }
  | { status: "terminal" }
  | { status: "failed" };

type SyncSummary = {
  serverSessionId: string;
  annotationsSynced: number;
  progressSynced: boolean;
  continuation: ReaderAnnotationContinuationOutcome | null;
};

export type OfflineReaderSyncResult =
  | { status: "nothing-to-sync" }
  | { status: "nothing-eligible"; reason: "deferred" | "manual-work-remains" }
  | ({ status: "synced" } & SyncSummary)
  | ({
      status: "partially-synced";
      stoppedAt: SyncStage | "complete";
      failure: SyncFailure | { status: "work-remains" };
    } & SyncSummary)
  | (SyncFailure & { stage: SyncStage });

export type OfflineReaderSyncInput = {
  namespaceKey: string;
  bookId: string;
  client: OfflineReaderSyncClient;
  stateRepository: OfflineReaderStateRepository;
  outboxRepository: ReaderOutboxRepository;
  continuationRepository: ReaderAnnotationContinuationRepository;
  generateClientId?: () => string;
  attemptMode?: OfflineReaderAttemptMode;
  now?: () => number;
};

const activeSyncs = new Map<string, Promise<OfflineReaderSyncResult>>();

// Reconciles authority before annotations, then progress. Progress must target the session
// selected by annotation continuation when SESSION_CLOSED moves work to a new Reading Session.
export function syncOfflineReader(input: OfflineReaderSyncInput): Promise<OfflineReaderSyncResult> {
  const namespaceKey = input.namespaceKey.trim();
  const bookId = input.bookId.trim();
  if (!namespaceKey || !bookId) {
    return Promise.resolve({ status: "failed", stage: "authority" });
  }

  const scopeKey = JSON.stringify([namespaceKey, bookId]);
  const active = activeSyncs.get(scopeKey);
  if (active) return active;

  const operation = runSync({ ...input, namespaceKey, bookId });
  activeSyncs.set(scopeKey, operation);
  const clear = () => {
    if (activeSyncs.get(scopeKey) === operation) activeSyncs.delete(scopeKey);
  };
  void operation.then(clear, clear);
  return operation;
}

async function runSync(input: OfflineReaderSyncInput): Promise<OfflineReaderSyncResult> {
  let pending: ReaderOutboxIntent[];
  try {
    pending = bookIntents(await input.outboxRepository.list(input.namespaceKey), input.bookId);
  } catch {
    return { status: "failed", stage: "authority" };
  }
  if (pending.length === 0) return { status: "nothing-to-sync" };
  const attemptMode = input.attemptMode ?? "manual";
  const now = (input.now ?? Date.now)();
  const eligible = pending.filter((intent) => isOfflineReaderIntentEligible({ intent, mode: attemptMode, now }));
  if (eligible.length === 0) return ineligibleResult(pending, now);

  const authority = await reconcileOfflineReaderSessionAuthority({
    namespaceKey: input.namespaceKey,
    bookId: input.bookId,
    authority: input.client.marginalia.books,
    stateRepository: input.stateRepository,
    outboxRepository: input.outboxRepository,
  });
  if (authority.status !== "resolved") {
    await recordAuthorityFailure(input.outboxRepository, eligible, authority, now);
    return authorityFailure(authority);
  }

  const initialSessionId = authority.state.session.serverSessionId;
  if (!initialSessionId || initialSessionId.startsWith("local:")) {
    return { status: "refresh-authority", stage: "authority" };
  }

  const annotations = await replayOfflineReaderAnnotations({
    namespaceKey: input.namespaceKey,
    bookId: input.bookId,
    serverSessionId: initialSessionId,
    client: input.client,
    stateRepository: input.stateRepository,
    outboxRepository: input.outboxRepository,
    continuationRepository: input.continuationRepository,
    generateClientId: input.generateClientId,
    attemptMode,
    now: input.now,
  });
  if (annotations.status !== "replayed"
    && annotations.status !== "no-pending"
    && annotations.status !== "nothing-eligible") {
    return replayFailure(annotations, "annotations");
  }

  const continuation = annotations.continuation;
  const finalSessionId = continuation?.toSessionId || initialSessionId;
  const annotationsSynced = annotations.status === "replayed" ? annotations.acknowledged : 0;
  const annotationStageCommitted = annotations.status === "replayed" || continuation !== null;

  const progress = await replayOfflineReaderProgress({
    namespaceKey: input.namespaceKey,
    bookId: input.bookId,
    serverSessionId: finalSessionId,
    client: input.client,
    stateRepository: input.stateRepository,
    outboxRepository: input.outboxRepository,
    attemptMode,
    now: input.now,
  });
  if (progress.status !== "replayed"
    && progress.status !== "nothing-to-replay"
    && progress.status !== "nothing-eligible") {
    const failure = normalizedReplayFailure(progress);
    if (!annotationStageCommitted) return { ...failure, stage: "progress" };
    return {
      status: "partially-synced",
      stoppedAt: "progress",
      failure,
      serverSessionId: finalSessionId,
      annotationsSynced,
      progressSynced: false,
      continuation,
    };
  }

  const deliveredSessionId = progress.status === "replayed" ? progress.sessionId : finalSessionId;
  const summary: SyncSummary = {
    serverSessionId: deliveredSessionId,
    annotationsSynced,
    progressSynced: progress.status === "replayed" && progress.acknowledged,
    continuation,
  };

  let remaining: ReaderOutboxIntent[];
  try {
    remaining = bookIntents(await input.outboxRepository.list(input.namespaceKey), input.bookId);
  } catch {
    return {
      status: "partially-synced",
      stoppedAt: "complete",
      failure: { status: "failed" },
      ...summary,
    };
  }
  if (remaining.length > 0 && annotationsSynced === 0 && !summary.progressSynced) {
    return ineligibleResult(remaining, (input.now ?? Date.now)());
  }
  return remaining.length === 0
    ? { status: "synced", ...summary }
    : {
        status: "partially-synced",
        stoppedAt: "complete",
        failure: { status: "work-remains" },
        ...summary,
      };
}

function ineligibleResult(intents: readonly ReaderOutboxIntent[], now: number): OfflineReaderSyncResult {
  const deferred = intents.some((intent) => (
    offlineReaderRetryEligibility({ intent, mode: "automatic", now }) === "deferred"
  ));
  return { status: "nothing-eligible", reason: deferred ? "deferred" : "manual-work-remains" };
}

async function recordAuthorityFailure(
  repository: ReaderOutboxRepository,
  intents: readonly ReaderOutboxIntent[],
  result: Exclude<OfflineReaderSessionReconciliationResult, { status: "resolved" }>,
  now: number,
): Promise<void> {
  const classification = result.status === "unavailable" ? "terminal-request"
    : result.status === "no-local-state" || result.status === "failed" ? "failed"
      : result.status;
  try {
    await recordOfflineReaderAttemptFailure({
      repository,
      intents,
      classification,
      retryAfterMs: result.status === "retry-later" ? result.retryAfterMs : null,
      now,
    });
  } catch {
    // Preserve the normalized authority result when local attempt bookkeeping fails.
  }
}

function bookIntents(intents: readonly ReaderOutboxIntent[], bookId: string): ReaderOutboxIntent[] {
  return intents.filter((intent) => intent.bookId === bookId);
}

function authorityFailure(
  result: Exclude<OfflineReaderSessionReconciliationResult, { status: "resolved" }>,
): OfflineReaderSyncResult {
  switch (result.status) {
    case "retry-later": return { ...result, stage: "authority" };
    case "reauthenticate": return { ...result, stage: "authority" };
    case "refresh-authority": return { ...result, stage: "authority" };
    case "unavailable": return { status: "terminal", stage: "authority" };
    case "no-local-state":
    case "failed": return { status: "failed", stage: "authority" };
  }
}

function replayFailure(
  result: Exclude<OfflineReaderAnnotationReplayResult, { status: "replayed" | "no-pending" | "nothing-eligible" }>,
  stage: "annotations",
): OfflineReaderSyncResult {
  return { ...normalizedReplayFailure(result), stage };
}

function normalizedReplayFailure(
  result:
    | Exclude<OfflineReaderAnnotationReplayResult, { status: "replayed" | "no-pending" | "nothing-eligible" }>
    | Exclude<OfflineReaderProgressReplayResult, { status: "replayed" | "nothing-to-replay" | "nothing-eligible" }>,
): SyncFailure {
  switch (result.status) {
    case "retry-later": return result;
    case "reauthenticate": return result;
    case "refresh-authority": return result;
    case "terminal-request": return { status: "terminal" };
    case "no-local-state":
    case "failed": return { status: "failed" };
  }
}
