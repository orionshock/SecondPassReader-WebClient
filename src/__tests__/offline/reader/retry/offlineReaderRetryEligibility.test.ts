import { describe, expect, it } from "vitest";
import { offlineReaderRetryEligibility } from "../../../../app/offline/reader/retry/OfflineReaderRetryEligibility.Policy";
import type { ReplaceReaderProgressIntent } from "../../../../app/offline/reader/outbox/ReaderOutbox.Policy";

describe("offline Reader retry eligibility", () => {
  it("treats old records without attempt state as automatically eligible", () => {
    expect(eligibility(progressIntent(), "automatic", 1_000)).toBe("eligible");
  });

  it("defers retry-later revisions until their durable boundary and lets manual retry override it", () => {
    const intent = progressIntent({ classification: "retry-later", retryEligibleAt: 2_000 });
    expect(eligibility(intent, "automatic", 1_999)).toBe("deferred");
    expect(eligibility(intent, "automatic", 2_000)).toBe("eligible");
    expect(eligibility(intent, "manual", 1_000)).toBe("eligible");
  });

  it("keeps auth, authority, terminal, and unknown failures out of automatic delivery", () => {
    expect(eligibility(progressIntent({ classification: "reauthenticate" }), "automatic", 1_000)).toBe("blocked-auth");
    expect(eligibility(progressIntent({ classification: "refresh-authority" }), "automatic", 1_000)).toBe("blocked-authority");
    expect(eligibility(progressIntent({ classification: "terminal-request" }), "automatic", 1_000)).toBe("manual-only");
    expect(eligibility(progressIntent({ classification: "failed" }), "automatic", 1_000)).toBe("manual-only");
  });

  it("ignores attempt state belonging to an older revision", () => {
    const intent = progressIntent({ classification: "terminal-request", revision: 1 }, 2);
    expect(eligibility(intent, "automatic", 1_000)).toBe("eligible");
  });
});

type AttemptInput = {
  classification: NonNullable<ReplaceReaderProgressIntent["attempt"]>["classification"];
  revision?: number;
  retryEligibleAt?: number | null;
};

function progressIntent(attempt?: AttemptInput, revision = 1): ReplaceReaderProgressIntent {
  return {
    type: "replace-progress",
    namespaceKey: "account-a",
    bookId: "book-1",
    serverSessionId: "session-1",
    intentRevision: revision,
    progress: { location: "epubcfi(/6/2)", percentage: 10, locationLabel: "010% - One" },
    ...(attempt ? { attempt: {
      revision: attempt.revision ?? revision,
      classification: attempt.classification,
      attemptCount: 1,
      attemptedAt: 1_000,
      retryEligibleAt: attempt.retryEligibleAt ?? null,
    } } : {}),
  };
}

function eligibility(intent: ReplaceReaderProgressIntent, mode: "automatic" | "manual", now: number) {
  return offlineReaderRetryEligibility({ intent, mode, now });
}
