import { describe, expect, it, vi } from "vitest";
import {
  pendingReaderSyncBookIds,
  syncPendingOfflineReaderWork,
  type OfflineReaderPendingSyncDependencies,
} from "../../../../app/offline/reader/sync/OfflineReaderPendingSync.Actions";
import type { OfflineReaderCoordinatedSyncResult } from "../../../../app/offline/reader/sync/OfflineReaderCoordinatedSync.Actions";
import type { ReaderOutboxIntent } from "../../../../app/offline/reader/outbox/ReaderOutbox.Policy";
import type { OfflineReaderSyncClient } from "../../../../app/offline/reader/sync/OfflineReaderSync.Actions";
import { createInMemoryReaderRepositories } from "../../storage/OfflineRepositoryTest.Fixtures";

describe("pending offline Reader sync", () => {
  it("derives sorted distinct Books across all Reader intent types", () => {
    expect(pendingReaderSyncBookIds([
      progressIntent("book-3"),
      annotationIntent("book-2"),
      establishIntent("book-1"),
      annotationIntent("book-3", "annotation-2"),
    ])).toEqual(["book-1", "book-2", "book-3"]);
  });

  it("skips automatic Books with only terminal or deferred resources but includes them for manual retry", () => {
    const terminal = { ...annotationIntent("book-terminal"), attempt: attempt("terminal-request", null) };
    const deferred = { ...progressIntent("book-deferred"), attempt: attempt("retry-later", 2_000) };
    const clean = progressIntent("book-clean");

    expect(pendingReaderSyncBookIds([terminal, deferred, clean], "automatic", 1_000)).toEqual(["book-clean"]);
    expect(pendingReaderSyncBookIds([terminal, deferred, clean], "manual", 1_000)).toEqual([
      "book-clean", "book-deferred", "book-terminal",
    ]);
  });

  it("lists one namespace, invokes each Book once with if-available, and closes repositories", async () => {
    const harness = await createHarness([
      establishIntent("book-1"),
      annotationIntent("book-1"),
      progressIntent("book-2"),
    ]);

    const result = await harness.run();

    expect(result).toEqual(completedSweep(2, 2, { completedBooks: 2 }));
    expect(harness.list).toHaveBeenCalledWith("account-a");
    expect(harness.syncBook.mock.calls.map(([input]) => input.bookId).sort()).toEqual(["book-1", "book-2"]);
    expect(harness.syncBook.mock.calls.every(([input]) => input.mode === "if-available")).toBe(true);
    expect(harness.openRepositories).toHaveBeenCalledOnce();
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it("closes quietly without Book calls when the namespace outbox is empty", async () => {
    const harness = await createHarness([]);

    await expect(harness.run()).resolves.toEqual(completedSweep(0, 0));
    expect(harness.syncBook).not.toHaveBeenCalled();
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it("converges concurrent startup and reconnect requests for one namespace", async () => {
    const harness = await createHarness([establishIntent("book-1")]);
    const gate = deferred<OfflineReaderCoordinatedSyncResult>();
    harness.syncBook.mockReturnValue(gate.promise);

    const startup = harness.run();
    const reconnect = harness.run();
    expect(startup).toBe(reconnect);
    await waitFor(() => harness.syncBook.mock.calls.length === 1);
    gate.resolve(completed());

    await expect(Promise.all([startup, reconnect])).resolves.toEqual([
      completedSweep(1, 1, { completedBooks: 1 }),
      completedSweep(1, 1, { completedBooks: 1 }),
    ]);
    expect(harness.openRepositories).toHaveBeenCalledOnce();
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it("starts a fresh sweep with the current route's client after the prior generation expires", async () => {
    const harness = await createHarness([establishIntent("book-1")]);
    const oldRouteGate = deferred<OfflineReaderCoordinatedSyncResult>();
    harness.syncBook.mockReturnValueOnce(oldRouteGate.promise).mockResolvedValue(completed());
    const oldRouteClient = client();
    const currentRouteClient = client();
    let oldGenerationCurrent = true;

    const oldRoute = harness.run(() => oldGenerationCurrent, undefined, undefined, oldRouteClient);
    await waitFor(() => harness.syncBook.mock.calls.length === 1);
    oldGenerationCurrent = false;
    const currentRoute = harness.run(() => true, undefined, undefined, currentRouteClient);

    expect(currentRoute).not.toBe(oldRoute);
    expect(harness.syncBook).toHaveBeenCalledTimes(1);
    oldRouteGate.resolve(completed());
    await oldRoute;
    await currentRoute;

    expect(harness.syncBook).toHaveBeenCalledTimes(2);
    expect(harness.syncBook.mock.calls[0]?.[0].client).toBe(oldRouteClient);
    expect(harness.syncBook.mock.calls[1]?.[0].client).toBe(currentRouteClient);
    expect(harness.openRepositories).toHaveBeenCalledTimes(2);
  });

  it("runs an explicit wait-mode sweep after an in-flight automatic non-waiting sweep", async () => {
    const harness = await createHarness([establishIntent("book-1")]);
    const automaticGate = deferred<OfflineReaderCoordinatedSyncResult>();
    harness.syncBook
      .mockReturnValueOnce(automaticGate.promise)
      .mockResolvedValue(completed());

    const automatic = harness.run();
    await waitFor(() => harness.syncBook.mock.calls.length === 1);
    const manual = harness.run(undefined, undefined, "wait");
    automaticGate.resolve(completed());
    await automatic;
    await manual;

    expect(harness.syncBook).toHaveBeenCalledTimes(2);
    expect(harness.syncBook.mock.calls.map(([input]) => input.mode)).toEqual(["if-available", "wait"]);
    expect(harness.openRepositories).toHaveBeenCalledTimes(2);
    expect(harness.close).toHaveBeenCalledTimes(2);
  });

  it("allows independent namespace sweeps", async () => {
    const first = await createHarness([establishIntent("book-1")]);
    const second = await createHarness([establishIntent("book-2", "account-b")], "account-b");
    const gate = deferred<OfflineReaderCoordinatedSyncResult>();
    first.syncBook.mockReturnValue(gate.promise);

    const firstRun = first.run();
    await waitFor(() => first.syncBook.mock.calls.length === 1);
    await expect(second.run()).resolves.toEqual(completedSweep(1, 1, { completedBooks: 1 }));
    gate.resolve(completed());
    await firstRun;

    expect(second.syncBook).toHaveBeenCalledOnce();
  });

  it("bounds Book concurrency at three", async () => {
    const intents = Array.from({ length: 7 }, (_, index) => establishIntent(`book-${index + 1}`));
    const harness = await createHarness(intents);
    const gates: Array<ReturnType<typeof deferred<OfflineReaderCoordinatedSyncResult>>> = [];
    let active = 0;
    let maximumActive = 0;
    harness.syncBook.mockImplementation(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      const gate = deferred<OfflineReaderCoordinatedSyncResult>();
      gates.push(gate);
      const result = await gate.promise;
      active -= 1;
      return result;
    });

    const running = harness.run();
    await waitFor(() => gates.length === 3);
    while (harness.close.mock.calls.length === 0) {
      for (const gate of gates.filter((candidate) => !candidate.resolved)) gate.resolve(completed());
      await settle();
    }
    await running;

    expect(harness.syncBook).toHaveBeenCalledTimes(7);
    expect(maximumActive).toBe(3);
  });

  it("stops starting new Books when its authenticated generation expires", async () => {
    const harness = await createHarness(Array.from({ length: 4 }, (_, index) => establishIntent(`book-${index + 1}`)));
    const gate = deferred<OfflineReaderCoordinatedSyncResult>();
    let current = true;
    harness.syncBook.mockReturnValue(gate.promise);

    const running = harness.run(() => current);
    await waitFor(() => harness.syncBook.mock.calls.length === 3);
    current = false;
    gate.resolve(completed());
    await running;

    expect(harness.syncBook).toHaveBeenCalledTimes(3);
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it("isolates Book failures and reports only normalized context", async () => {
    const harness = await createHarness([
      establishIntent("book-1"),
      establishIntent("book-2"),
      establishIntent("book-3"),
      establishIntent("book-4"),
    ]);
    harness.syncBook.mockImplementation(async ({ bookId }) => {
      if (bookId === "book-1") return { status: "busy" };
      if (bookId === "book-2") {
        return { status: "completed", sync: { status: "retry-later", retryAfterMs: null, stage: "authority" } };
      }
      if (bookId === "book-3") throw new Error("raw failure https://secret.invalid");
      return completed();
    });

    const result = await harness.run();

    expect(harness.syncBook).toHaveBeenCalledTimes(4);
    expect(result).toEqual(completedSweep(4, 4, {
      completedBooks: 1,
      busyBooks: 1,
      retryLaterBooks: 1,
      failedBooks: 1,
    }));
    expect(harness.reportFailure).toHaveBeenCalledWith("sync-retry-later", "book-2");
    expect(harness.reportFailure).toHaveBeenCalledWith("sync-book", "book-3");
    expect(JSON.stringify(harness.reportFailure.mock.calls)).not.toContain("secret.invalid");
  });

  it("aggregates continuation and terminal outcomes across Books and publishes once", async () => {
    const harness = await createHarness([
      establishIntent("book-1"),
      establishIntent("book-2"),
      establishIntent("book-3"),
    ]);
    const onCompleted = vi.fn();
    harness.syncBook.mockImplementation(async ({ bookId }) => {
      if (bookId === "book-1") return completedWithContinuation(2, 1, 3);
      if (bookId === "book-2") {
        return { status: "completed", sync: { status: "terminal", stage: "annotations" } };
      }
      return completedWithContinuation(1, 0, 0);
    });

    const result = await harness.run(undefined, onCompleted);

    expect(result).toEqual(completedSweep(3, 3, {
      completedBooks: 2,
      terminalBooks: 1,
      continuationBooks: 2,
      meaningfulOutcomeBooks: 3,
      forwardedConfirmedEdits: 3,
      droppedConfirmedDeletes: 1,
      continuedLocalUpserts: 3,
    }));
    expect(onCompleted).toHaveBeenCalledOnce();
    expect(onCompleted).toHaveBeenCalledWith(result);
  });

  it("does not publish a completed sweep after its account generation expires", async () => {
    const harness = await createHarness([establishIntent("book-1")]);
    const gate = deferred<OfflineReaderCoordinatedSyncResult>();
    const onCompleted = vi.fn();
    let current = true;
    harness.syncBook.mockReturnValue(gate.promise);

    const running = harness.run(() => current, onCompleted);
    await waitFor(() => harness.syncBook.mock.calls.length === 1);
    current = false;
    gate.resolve(completed());
    await running;

    expect(onCompleted).not.toHaveBeenCalled();
  });

  it("normalizes repository failure and closes an opened bundle", async () => {
    const openFailure = await createHarness([]);
    openFailure.openRepositories.mockRejectedValue(new Error("raw open failure"));
    await expect(openFailure.run()).resolves.toEqual({ status: "failed", stage: "open-repositories" });
    expect(openFailure.reportFailure).toHaveBeenCalledWith("open-repositories");

    const listFailure = await createHarness([]);
    listFailure.list.mockRejectedValue(new Error("raw list failure"));
    await expect(listFailure.run()).resolves.toEqual({ status: "failed", stage: "list-outbox" });
    expect(listFailure.close).toHaveBeenCalledOnce();
    expect(listFailure.reportFailure).toHaveBeenCalledWith("list-outbox");
  });
});

async function createHarness(intents: ReaderOutboxIntent[], namespaceKey = "account-a") {
  const { stateRepository: readerState, outboxRepository: readerOutbox, annotationCommitRepository } =
    createInMemoryReaderRepositories();
  for (const intent of intents) await readerOutbox.upsertIntent(intent);
  const close = vi.fn();
  const list = vi.spyOn(readerOutbox, "list");
  const openRepositories = vi.fn(async () => ({
    readerState,
    readerOutbox,
    readerAnnotationCommit: annotationCommitRepository,
    close,
  }));
  const syncBook = vi.fn<OfflineReaderPendingSyncDependencies["syncBook"]>(async () => completed());
  const reportFailure = vi.fn<OfflineReaderPendingSyncDependencies["reportFailure"]>();
  const dependencies: OfflineReaderPendingSyncDependencies = { openRepositories, syncBook, reportFailure };
  const run = (
    isCurrent?: () => boolean,
    onCompleted?: Parameters<typeof syncPendingOfflineReaderWork>[0]["onCompleted"],
    mode?: Parameters<typeof syncPendingOfflineReaderWork>[0]["mode"],
    syncClient = client(),
  ) => syncPendingOfflineReaderWork({
    namespaceKey,
    client: syncClient,
    isCurrent,
    onCompleted,
    mode,
  }, dependencies);
  return { close, list, openRepositories, syncBook, reportFailure, run };
}

function client(): OfflineReaderSyncClient {
  const unexpected = async () => { throw new Error("Pending sync must use coordinated delivery."); };
  return {
    marginalia: {
      books: { getActiveSession: unexpected, open: unexpected },
      sessions: { batchAnnotations: unexpected, replaceProgress: unexpected },
    },
  };
}

function attempt(classification: "terminal-request" | "retry-later", retryEligibleAt: number | null) {
  return { revision: 1, classification, attemptCount: 1, attemptedAt: 1_000, retryEligibleAt } as const;
}

function completed(): OfflineReaderCoordinatedSyncResult {
  return { status: "completed", sync: { status: "nothing-to-sync" } };
}

function completedWithContinuation(
  forwardedConfirmedEdits: number,
  droppedConfirmedDeletes: number,
  continuedLocalUpserts: number,
): OfflineReaderCoordinatedSyncResult {
  return {
    status: "completed",
    sync: {
      status: "synced",
      serverSessionId: "session-current",
      annotationsSynced: 1,
      progressSynced: false,
      continuation: {
        forwardedConfirmedEdits,
        droppedConfirmedDeletes,
        continuedLocalUpserts,
        fromSessionId: "session-closed",
        toSessionId: "session-current",
      },
    },
  };
}

function completedSweep(
  discoveredBooks: number,
  attemptedBooks: number,
  outcome: Partial<Extract<Awaited<ReturnType<typeof syncPendingOfflineReaderWork>>, { status: "completed" }>["outcome"]> = {},
) {
  return {
    status: "completed",
    discoveredBooks,
    attemptedBooks,
    outcome: {
      completedBooks: 0,
      partiallySyncedBooks: 0,
      busyBooks: 0,
      retryLaterBooks: 0,
      reauthenticateBooks: 0,
      refreshAuthorityBooks: 0,
      terminalBooks: 0,
      failedBooks: 0,
      continuationBooks: 0,
      meaningfulOutcomeBooks: 0,
      forwardedConfirmedEdits: 0,
      droppedConfirmedDeletes: 0,
      continuedLocalUpserts: 0,
      ...outcome,
    },
  };
}

function establishIntent(bookId: string, namespaceKey = "account-a"): ReaderOutboxIntent {
  return { type: "establish-session", namespaceKey, bookId };
}

function annotationIntent(bookId: string, clientId = "annotation-1"): ReaderOutboxIntent {
  return {
    type: "upsert-annotation",
    namespaceKey: "account-a",
    bookId,
    serverSessionId: null,
    intentRevision: 1,
    origin: { kind: "local-unconfirmed" },
    annotation: { clientId, kind: "bookmark", location: { location: "epubcfi(/6/8)" } },
  };
}

function progressIntent(bookId: string): ReaderOutboxIntent {
  return {
    type: "replace-progress",
    namespaceKey: "account-a",
    bookId,
    serverSessionId: null,
    intentRevision: 1,
    progress: { location: "epubcfi(/6/8)", percentage: 40, locationLabel: "040% - Chapter" },
  };
}

function deferred<T>() {
  let settled = false;
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolve) => { resolvePromise = resolve; });
  return {
    promise,
    resolve(value: T) {
      settled = true;
      resolvePromise(value);
    },
    get resolved() { return settled; },
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (condition()) return;
    await settle();
  }
  throw new Error("Condition was not reached.");
}
