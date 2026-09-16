import { describe, expect, it, vi } from "vitest";
import type { ReaderOutboxRepository } from "../../../../app/offline/storage/OfflineRepositories.Types";
import {
  classifyOfflineReaderReplayFailure,
  recordOfflineReaderAttemptFailure,
  recordOfflineReaderReplayFailure,
} from "../../../../app/offline/reader/retry/OfflineReaderAttempt.Actions";
import type { ReaderOutboxIntent } from "../../../../app/offline/reader/outbox/ReaderOutbox.Policy";

describe("offline Reader attempt bookkeeping", () => {
  it("normalizes replay failures once while keeping SESSION_CLOSED out of attempt state", () => {
    expect(classifyOfflineReaderReplayFailure(new TypeError("network interrupted"))).toEqual({
      status: "retry-later",
      retryAfterMs: null,
    });
    expect(classifyOfflineReaderReplayFailure({ kind: "http", status: 403 })).toEqual({
      status: "refresh-authority",
    });
    expect(classifyOfflineReaderReplayFailure({ kind: "http", status: 409, code: "SESSION_CLOSED" })).toEqual({
      status: "session-closed",
    });
  });

  it("increments matching-revision attempts and honors the server retry delay", async () => {
    const repository = outboxRepository();
    const intent = progressIntent(3, {
      revision: 3,
      classification: "retry-later",
      attemptCount: 2,
      attemptedAt: 500,
      retryEligibleAt: 1_000,
    });

    await recordOfflineReaderReplayFailure({
      repository,
      intents: [intent],
      failure: { status: "retry-later", retryAfterMs: 120_000 },
      now: 2_000,
    });

    expect(repository.recordAttempt).toHaveBeenCalledWith(
      "account-a",
      expect.any(String),
      3,
      {
        revision: 3,
        classification: "retry-later",
        attemptCount: 3,
        attemptedAt: 2_000,
        retryEligibleAt: 122_000,
      },
    );
  });

  it("classifies exact-revision rejection as stale without modifying a newer intent", async () => {
    const repository = outboxRepository();
    vi.mocked(repository.recordAttempt).mockResolvedValue(false);

    await expect(recordOfflineReaderReplayFailure({
      repository,
      intents: [progressIntent(1)],
      failure: { status: "terminal-request" },
      now: 2_000,
    })).resolves.toEqual({ recorded: 0, stale: 1, failed: 0 });
  });

  it("keeps recording sibling attempts when one bookkeeping write fails", async () => {
    const repository = outboxRepository();
    vi.mocked(repository.recordAttempt)
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockResolvedValueOnce(true);

    await expect(recordOfflineReaderAttemptFailure({
      repository,
      intents: [progressIntent(1, undefined, "book-a"), progressIntent(1, undefined, "book-b")],
      classification: "failed",
      now: 2_000,
    })).resolves.toEqual({ recorded: 1, stale: 0, failed: 1 });
    expect(repository.recordAttempt).toHaveBeenCalledTimes(2);
  });
});

function outboxRepository(): ReaderOutboxRepository {
  return {
    list: vi.fn(),
    upsertIntent: vi.fn(),
    remove: vi.fn(),
    replace: vi.fn(),
    recordAttempt: vi.fn(async () => true),
    deleteNamespace: vi.fn(),
  };
}

function progressIntent(
  revision: number,
  attempt?: Extract<ReaderOutboxIntent, { type: "replace-progress" }>["attempt"],
  bookId = "book-1",
): Extract<ReaderOutboxIntent, { type: "replace-progress" }> {
  return {
    type: "replace-progress",
    namespaceKey: "account-a",
    bookId,
    serverSessionId: "session-1",
    intentRevision: revision,
    progress: { cfi: "epubcfi(/6/2)", percentage: 10, locationLabel: "Chapter" },
    attempt,
  };
}
