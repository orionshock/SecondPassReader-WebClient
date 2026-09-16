import type { ReaderOutboxRepository } from "../../storage/OfflineRepositories.Types";
import { classifyOfflineDeliveryFailure, computeOfflineRetryDelay } from "./OfflineRetry.Policy";
import {
  readerIntentRevision,
  readerIntentResourceKey,
  type ReaderOutboxAttemptClassification,
  type ReaderOutboxIntent,
} from "../outbox/ReaderOutbox.Policy";

export type OfflineReaderReplayFailure =
  | { status: "retry-later"; retryAfterMs: number | null }
  | { status: "reauthenticate" }
  | { status: "refresh-authority" }
  | { status: "session-closed" }
  | { status: "terminal-request" }
  | { status: "failed" };

export type OfflineReaderAttemptRecordingResult = {
  recorded: number;
  stale: number;
  failed: number;
};

export function classifyOfflineReaderReplayFailure(error: unknown): OfflineReaderReplayFailure {
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

export function recordOfflineReaderReplayFailure(input: {
  repository: ReaderOutboxRepository;
  intents: readonly ReaderOutboxIntent[];
  failure: Exclude<OfflineReaderReplayFailure, { status: "session-closed" }>;
  now?: number;
}): Promise<OfflineReaderAttemptRecordingResult> {
  return recordOfflineReaderAttemptFailure({
    repository: input.repository,
    intents: input.intents,
    classification: input.failure.status,
    retryAfterMs: input.failure.status === "retry-later" ? input.failure.retryAfterMs : null,
    now: input.now,
  });
}

export async function recordOfflineReaderAttemptFailure(input: {
  repository: ReaderOutboxRepository;
  intents: readonly ReaderOutboxIntent[];
  classification: ReaderOutboxAttemptClassification;
  retryAfterMs?: number | null;
  now?: number;
}): Promise<OfflineReaderAttemptRecordingResult> {
  const attemptedAt = input.now ?? Date.now();
  const result: OfflineReaderAttemptRecordingResult = { recorded: 0, stale: 0, failed: 0 };
  for (const intent of input.intents) {
    const revision = readerIntentRevision(intent);
    const attemptCount = intent.attempt?.revision === revision ? intent.attempt.attemptCount + 1 : 1;
    const retryEligibleAt = input.classification === "retry-later"
      ? attemptedAt + computeOfflineRetryDelay({ attempt: attemptCount, retryAfterMs: input.retryAfterMs })
      : null;
    try {
      const recorded = await input.repository.recordAttempt(
        intent.namespaceKey,
        readerIntentResourceKey(intent),
        revision,
        { revision, classification: input.classification, attemptCount, attemptedAt, retryEligibleAt },
      );
      if (recorded) result.recorded += 1;
      else result.stale += 1;
    } catch {
      // Attempt metadata is advisory. A bookkeeping failure must not replace the delivery result
      // or erase durable desired work, and it must not prevent sibling attempts being recorded.
      result.failed += 1;
    }
  }
  return result;
}
