import type { ReaderOutboxIntent } from "./ReaderOutbox.Policy";

export type OfflineReaderRetrySchedule =
  | { status: "none" }
  | { status: "due"; retryEligibleAt: number }
  | { status: "scheduled"; retryEligibleAt: number };

export function getOfflineReaderRetrySchedule(
  intents: readonly ReaderOutboxIntent[],
  now: number,
): OfflineReaderRetrySchedule {
  const times = intents.flatMap((intent) => {
    const attempt = intent.attempt;
    return attempt?.classification === "retry-later"
      && attempt.revision === ("intentRevision" in intent ? intent.intentRevision : null)
      && typeof attempt.retryEligibleAt === "number"
      && Number.isFinite(attempt.retryEligibleAt)
      && attempt.retryEligibleAt >= 0
      ? [attempt.retryEligibleAt]
      : [];
  });
  if (times.length === 0) return { status: "none" };
  const retryEligibleAt = Math.min(...times);
  return retryEligibleAt <= now
    ? { status: "due", retryEligibleAt }
    : { status: "scheduled", retryEligibleAt };
}
