import type { MarginaliaProgress, MarginaliaProgressInput } from "@secondpass/client";
import type {
  OfflineReaderBookState,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "../../storage/OfflineRepositories.Types";
import {
  reconcileOfflineReaderSessionAuthority,
  type ReaderSessionAuthority,
} from "../sync/OfflineReaderSessionReconciliation.Actions";
import {
  classifyOfflineReaderReplayFailure,
  recordOfflineReaderReplayFailure,
  type OfflineReaderReplayFailure,
} from "../retry/OfflineReaderAttempt.Actions";
import {
  isOfflineReaderIntentEligible,
  type OfflineReaderAttemptMode,
} from "../retry/OfflineReaderRetryEligibility.Policy";
import {
  readerIntentResourceKey,
  type ReaderOutboxIntent,
  type ReplaceReaderProgressIntent,
} from "../outbox/ReaderOutbox.Policy";

export type ReaderProgressReplayClient = {
  marginalia: {
    books: ReaderSessionAuthority;
    sessions: {
      replaceProgress(
        sessionId: string,
        input: MarginaliaProgressInput,
      ): Promise<{ progress: MarginaliaProgress }>;
    };
  };
};

export type OfflineReaderProgressReplayResult =
  | {
      status: "replayed";
      sessionId: string;
      deliveredRevision: number;
      acknowledged: boolean;
      remaining: number;
      continuedFromSessionId: string | null;
    }
  | { status: "nothing-to-replay" }
  | { status: "nothing-eligible" }
  | { status: "no-local-state" }
  | { status: "retry-later"; retryAfterMs: number | null }
  | { status: "reauthenticate" }
  | { status: "refresh-authority" }
  | { status: "terminal-request" }
  | { status: "failed" };

type ProgressReplayFailure = Exclude<OfflineReaderReplayFailure, { status: "session-closed" }>;

type ReplayInput = {
  namespaceKey: string;
  bookId: string;
  serverSessionId: string;
  client: ReaderProgressReplayClient;
  stateRepository: OfflineReaderStateRepository;
  outboxRepository: ReaderOutboxRepository;
  attemptMode?: OfflineReaderAttemptMode;
  now?: () => number;
};

const activeReplays = new Map<string, Promise<OfflineReaderProgressReplayResult>>();

// Delivers only the progress snapshot that still matches durable desired state, then acknowledges
// its exact revision so movement recorded during the request remains pending.
export function replayOfflineReaderProgress(input: ReplayInput): Promise<OfflineReaderProgressReplayResult> {
  const namespaceKey = input.namespaceKey.trim();
  const bookId = input.bookId.trim();
  const serverSessionId = input.serverSessionId.trim();
  if (!namespaceKey || !bookId || !serverSessionId) return Promise.resolve({ status: "refresh-authority" });

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

async function runReplay(input: ReplayInput): Promise<OfflineReaderProgressReplayResult> {
  let state: OfflineReaderBookState | null;
  try {
    state = await input.stateRepository.getBookState(input.namespaceKey, input.bookId);
  } catch {
    return { status: "failed" };
  }
  if (!state) return { status: "no-local-state" };

  let serverSessionId = input.serverSessionId;
  if (!isCurrentAuthority(state, serverSessionId)) {
    const reconciliation = await reconcile(input);
    if (reconciliation.status !== "resolved") return mapReconciliationFailure(reconciliation);
    const resolvedSessionId = authoritativeSessionId(reconciliation.state);
    if (!resolvedSessionId) return { status: "refresh-authority" };
    serverSessionId = resolvedSessionId;
  }

  return deliver(input, serverSessionId, null, true);
}

async function deliver(
  input: ReplayInput,
  serverSessionId: string,
  continuedFromSessionId: string | null,
  mayContinue: boolean,
): Promise<OfflineReaderProgressReplayResult> {
  let state: OfflineReaderBookState | null;
  let allIntents: ReaderOutboxIntent[];
  try {
    [state, allIntents] = await Promise.all([
      input.stateRepository.getBookState(input.namespaceKey, input.bookId),
      input.outboxRepository.list(input.namespaceKey),
    ]);
  } catch {
    return { status: "failed" };
  }
  if (!state) return { status: "no-local-state" };
  if (!isCurrentAuthority(state, serverSessionId)) return { status: "refresh-authority" };

  const intent = selectCurrentProgressIntent(allIntents, state, serverSessionId);
  if (!intent) return { status: "nothing-to-replay" };
  if (!isOfflineReaderIntentEligible({
    intent,
    mode: input.attemptMode ?? "manual",
    now: (input.now ?? Date.now)(),
  })) return { status: "nothing-eligible" };
  const deliveredProgress = structuredClone(intent.progress);

  let confirmed: MarginaliaProgress;
  try {
    const response = await input.client.marginalia.sessions.replaceProgress(serverSessionId, {
      location: deliveredProgress.location,
      locationLabel: deliveredProgress.locationLabel,
    });
    if (!response.progress?.location?.trim() || typeof response.progress.locationLabel !== "string") {
      return { status: "failed" };
    }
    confirmed = response.progress;
  } catch (error) {
    const failure = classifyOfflineReaderReplayFailure(error);
    if (failure.status !== "session-closed") {
      await recordOfflineReaderReplayFailure({
        repository: input.outboxRepository,
        intents: [intent],
        failure,
        now: (input.now ?? Date.now)(),
      });
      return failure;
    }
    if (!mayContinue) return { status: "refresh-authority" };

    const reconciliation = await reconcile(input);
    if (reconciliation.status !== "resolved") {
      const mapped = mapReconciliationFailure(reconciliation);
      if (mapped.status !== "no-local-state") {
        await recordOfflineReaderReplayFailure({
          repository: input.outboxRepository,
          intents: [intent],
          failure: mapped,
          now: (input.now ?? Date.now)(),
        });
      }
      return mapped;
    }
    const nextSessionId = authoritativeSessionId(reconciliation.state);
    if (!nextSessionId || nextSessionId === serverSessionId) {
      const failure = { status: "refresh-authority" } as const;
      await recordOfflineReaderReplayFailure({
        repository: input.outboxRepository,
        intents: [intent],
        failure,
        now: (input.now ?? Date.now)(),
      });
      return failure;
    }
    return deliver(input, nextSessionId, serverSessionId, false);
  }

  try {
    const update = await input.stateRepository.updateBookState(
      input.namespaceKey,
      input.bookId,
      (current) => sameProgress(current.progress, deliveredProgress)
        ? {
            ...current,
            progress: {
              ...deliveredProgress,
              location: confirmed.location.trim(),
              locationLabel: confirmed.locationLabel,
            },
          }
        : current,
    );
    if (update.status === "missing") return { status: "no-local-state" };
  } catch {
    return { status: "failed" };
  }

  let acknowledged: boolean;
  let remaining: number;
  try {
    acknowledged = await input.outboxRepository.remove(
      input.namespaceKey,
      readerIntentResourceKey(intent),
      intent.intentRevision,
    );
    remaining = progressIntents(await input.outboxRepository.list(input.namespaceKey), input.bookId).length;
  } catch {
    return { status: "failed" };
  }
  return {
    status: "replayed",
    sessionId: serverSessionId,
    deliveredRevision: intent.intentRevision,
    acknowledged,
    remaining,
    continuedFromSessionId,
  };
}

function selectCurrentProgressIntent(
  intents: readonly ReaderOutboxIntent[],
  state: OfflineReaderBookState,
  serverSessionId: string,
): ReplaceReaderProgressIntent | null {
  if (!state.progress) return null;
  const candidates = progressIntents(intents, state.bookId)
    .filter((intent) => sameProgress(intent.progress, state.progress))
    .sort((left, right) => {
      const targetDifference = Number(right.serverSessionId === serverSessionId)
        - Number(left.serverSessionId === serverSessionId);
      if (targetDifference !== 0) return targetDifference;
      if (left.intentRevision !== right.intentRevision) return right.intentRevision - left.intentRevision;
      return readerIntentResourceKey(left).localeCompare(readerIntentResourceKey(right));
    });
  return candidates[0] ?? null;
}

function progressIntents(
  intents: readonly ReaderOutboxIntent[],
  bookId: string,
): ReplaceReaderProgressIntent[] {
  return intents.filter((intent): intent is ReplaceReaderProgressIntent => (
    intent.type === "replace-progress" && intent.bookId === bookId
  ));
}

function isCurrentAuthority(state: OfflineReaderBookState, serverSessionId: string): boolean {
  return isServerSessionId(serverSessionId)
    && state.session.kind === "server-confirmed"
    && state.session.lastKnownServerStatus === "active"
    && state.session.serverSessionId === serverSessionId;
}

function authoritativeSessionId(state: OfflineReaderBookState): string | null {
  return state.session.kind === "server-confirmed"
    && state.session.lastKnownServerStatus === "active"
    && isServerSessionId(state.session.serverSessionId)
    ? state.session.serverSessionId
    : null;
}

function isServerSessionId(value: string): boolean {
  const normalized = value.trim();
  return Boolean(normalized && !normalized.startsWith("local:"));
}

function sameProgress(
  left: OfflineReaderBookState["progress"],
  right: OfflineReaderBookState["progress"],
): boolean {
  return Boolean(left && right
    && left.location === right.location
    && left.percentage === right.percentage
    && left.locationLabel === right.locationLabel);
}

function reconcile(input: ReplayInput) {
  return reconcileOfflineReaderSessionAuthority({
    namespaceKey: input.namespaceKey,
    bookId: input.bookId,
    authority: input.client.marginalia.books,
    stateRepository: input.stateRepository,
    outboxRepository: input.outboxRepository,
  });
}

function mapReconciliationFailure(
  result: Awaited<ReturnType<typeof reconcileOfflineReaderSessionAuthority>>,
): ProgressReplayFailure | { status: "no-local-state" } {
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
