import type { ReaderOutboxRepository } from "../../storage/OfflineRepositories.Types";
import { computeOfflineRetryDelay } from "./OfflineRetry.Policy";
import {
  readerIntentRevision,
  readerIntentResourceKey,
  type ReaderOutboxAttemptClassification,
  type ReaderOutboxIntent,
} from "../outbox/ReaderOutbox.Policy";

export async function recordOfflineReaderAttemptFailure(input: {
  repository: ReaderOutboxRepository;
  intents: readonly ReaderOutboxIntent[];
  classification: ReaderOutboxAttemptClassification;
  retryAfterMs?: number | null;
  now?: number;
}): Promise<void> {
  const attemptedAt = input.now ?? Date.now();
  for (const intent of input.intents) {
    const revision = readerIntentRevision(intent);
    const attemptCount = intent.attempt?.revision === revision ? intent.attempt.attemptCount + 1 : 1;
    const retryEligibleAt = input.classification === "retry-later"
      ? attemptedAt + computeOfflineRetryDelay({ attempt: attemptCount, retryAfterMs: input.retryAfterMs })
      : null;
    await input.repository.recordAttempt(
      intent.namespaceKey,
      readerIntentResourceKey(intent),
      revision,
      { revision, classification: input.classification, attemptCount, attemptedAt, retryEligibleAt },
    );
  }
}
