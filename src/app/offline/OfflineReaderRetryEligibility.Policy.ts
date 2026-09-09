import { computeOfflineRetryDelay } from "./OfflineRetry.Policy";
import { readerIntentRevision, type ReaderOutboxIntent } from "./ReaderOutbox.Policy";

export type OfflineReaderAttemptMode = "automatic" | "manual";
export type OfflineReaderRetryEligibility =
  | "eligible" | "deferred" | "manual-only" | "blocked-auth" | "blocked-authority";

export function offlineReaderRetryEligibility(input: {
  intent: ReaderOutboxIntent;
  mode: OfflineReaderAttemptMode;
  now: number;
}): OfflineReaderRetryEligibility {
  const attempt = input.intent.attempt;
  if (!attempt || attempt.revision !== readerIntentRevision(input.intent)) return "eligible";
  if (input.mode === "manual") return "eligible";
  switch (attempt.classification) {
    case "retry-later":
      return input.now >= (attempt.retryEligibleAt
        ?? attempt.attemptedAt + computeOfflineRetryDelay({ attempt: attempt.attemptCount }))
        ? "eligible" : "deferred";
    case "reauthenticate": return "blocked-auth";
    case "refresh-authority": return "blocked-authority";
    case "terminal-request":
    case "failed": return "manual-only";
  }
}

export function isOfflineReaderIntentEligible(input: {
  intent: ReaderOutboxIntent;
  mode: OfflineReaderAttemptMode;
  now: number;
}): boolean {
  return offlineReaderRetryEligibility(input) === "eligible";
}
