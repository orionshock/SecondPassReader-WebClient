import { describe, expect, it } from "vitest";
import { getOfflineReaderRetrySchedule } from "../../../../app/offline/reader/retry/OfflineReaderRetrySchedule.Policy";
import type { ReplaceReaderProgressIntent } from "../../../../app/offline/reader/outbox/ReaderOutbox.Policy";

describe("offline Reader retry schedule", () => {
  it("returns no timer for clean, terminal, auth, authority, or invalid retry state", () => {
    expect(getOfflineReaderRetrySchedule([
      progress(),
      progress({ classification: "terminal-request", retryEligibleAt: null }, 2),
      progress({ classification: "reauthenticate", retryEligibleAt: null }, 3),
      progress({ classification: "refresh-authority", retryEligibleAt: null }, 4),
      progress({ classification: "retry-later", retryEligibleAt: null }, 5),
    ], 1_000)).toEqual({ status: "none" });
  });

  it("selects the earliest durable retry time and classifies its exact boundary as due", () => {
    const intents = [
      progress({ classification: "retry-later", retryEligibleAt: 5_000 }, 1),
      progress({ classification: "retry-later", retryEligibleAt: 3_000 }, 2),
    ];
    expect(getOfflineReaderRetrySchedule(intents, 2_000)).toEqual({ status: "scheduled", retryEligibleAt: 3_000 });
    expect(getOfflineReaderRetrySchedule(intents, 3_000)).toEqual({ status: "due", retryEligibleAt: 3_000 });
  });

  it("ignores attempt timing from an obsolete revision", () => {
    const intent = progress({ classification: "retry-later", retryEligibleAt: 2_000, revision: 1 }, 2);
    expect(getOfflineReaderRetrySchedule([intent], 3_000)).toEqual({ status: "none" });
  });
});

type Attempt = {
  classification: NonNullable<ReplaceReaderProgressIntent["attempt"]>["classification"];
  retryEligibleAt: number | null;
  revision?: number;
};

function progress(attempt?: Attempt, revision = 1): ReplaceReaderProgressIntent {
  return {
    type: "replace-progress",
    namespaceKey: "account-a",
    bookId: `book-${revision}`,
    serverSessionId: "session-1",
    intentRevision: revision,
    progress: { location: "epubcfi(/6/2)", percentage: 10, locationLabel: "010% - One" },
    ...(attempt ? { attempt: {
      revision: attempt.revision ?? revision,
      classification: attempt.classification,
      attemptCount: 1,
      attemptedAt: 1_000,
      retryEligibleAt: attempt.retryEligibleAt,
    } } : {}),
  };
}
