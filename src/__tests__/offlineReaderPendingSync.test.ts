import { describe, expect, it, vi } from "vitest";
import {
  pendingReaderSyncBookIds,
  syncPendingOfflineReaderWork,
  type OfflineReaderPendingSyncDependencies,
} from "../app/offline/OfflineReaderPendingSync.Actions";
import type { OfflineReaderCoordinatedSyncResult } from "../app/offline/OfflineReaderCoordinatedSync.Actions";
import type { ReaderOutboxIntent } from "../app/offline/ReaderOutbox.Policy";
import type { OfflineReaderSyncClient } from "../app/offline/OfflineReaderSync.Actions";
import { createInMemoryOfflineRepositoryFactories } from "./OfflineRepositoryTest.Fixtures";

describe("pending offline Reader sync", () => {
  it("derives sorted distinct Books across all Reader intent types", () => {
    expect(pendingReaderSyncBookIds([
      progressIntent("book-3"),
      annotationIntent("book-2"),
      establishIntent("book-1"),
      annotationIntent("book-3", "annotation-2"),
    ])).toEqual(["book-1", "book-2", "book-3"]);
  });

  it("lists one namespace, invokes each Book once with if-available, and closes repositories", async () => {
    const harness = await createHarness([
      establishIntent("book-1"),
      annotationIntent("book-1"),
      progressIntent("book-2"),
    ]);

    const result = await harness.run();

    expect(result).toEqual({ status: "completed", discoveredBooks: 2, attemptedBooks: 2 });
    expect(harness.list).toHaveBeenCalledWith("account-a");
    expect(harness.syncBook.mock.calls.map(([input]) => input.bookId).sort()).toEqual(["book-1", "book-2"]);
    expect(harness.syncBook.mock.calls.every(([input]) => input.mode === "if-available")).toBe(true);
    expect(harness.openRepositories).toHaveBeenCalledOnce();
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it("closes quietly without Book calls when the namespace outbox is empty", async () => {
    const harness = await createHarness([]);

    await expect(harness.run()).resolves.toEqual({
      status: "completed",
      discoveredBooks: 0,
      attemptedBooks: 0,
    });
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
      { status: "completed", discoveredBooks: 1, attemptedBooks: 1 },
      { status: "completed", discoveredBooks: 1, attemptedBooks: 1 },
    ]);
    expect(harness.openRepositories).toHaveBeenCalledOnce();
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it("allows independent namespace sweeps", async () => {
    const first = await createHarness([establishIntent("book-1")]);
    const second = await createHarness([establishIntent("book-2", "account-b")], "account-b");
    const gate = deferred<OfflineReaderCoordinatedSyncResult>();
    first.syncBook.mockReturnValue(gate.promise);

    const firstRun = first.run();
    await waitFor(() => first.syncBook.mock.calls.length === 1);
    await expect(second.run()).resolves.toEqual({ status: "completed", discoveredBooks: 1, attemptedBooks: 1 });
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

    await harness.run();

    expect(harness.syncBook).toHaveBeenCalledTimes(4);
    expect(harness.reportFailure).toHaveBeenCalledWith("sync-retry-later", "book-2");
    expect(harness.reportFailure).toHaveBeenCalledWith("sync-book", "book-3");
    expect(JSON.stringify(harness.reportFailure.mock.calls)).not.toContain("secret.invalid");
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
  const factories = createInMemoryOfflineRepositoryFactories();
  const readerState = await factories.createReaderStateRepository();
  const readerOutbox = await factories.createReaderOutboxRepository();
  for (const intent of intents) await readerOutbox.upsertIntent(intent);
  const close = vi.fn();
  const list = vi.spyOn(readerOutbox, "list");
  const openRepositories = vi.fn(async () => ({ readerState, readerOutbox, close }));
  const syncBook = vi.fn<OfflineReaderPendingSyncDependencies["syncBook"]>(async () => completed());
  const reportFailure = vi.fn<OfflineReaderPendingSyncDependencies["reportFailure"]>();
  const dependencies: OfflineReaderPendingSyncDependencies = { openRepositories, syncBook, reportFailure };
  const run = (isCurrent?: () => boolean) => syncPendingOfflineReaderWork({
    namespaceKey,
    client: client(),
    isCurrent,
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

function completed(): OfflineReaderCoordinatedSyncResult {
  return { status: "completed", sync: { status: "nothing-to-sync" } };
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
    annotation: { clientId, kind: "bookmark", location: { cfi: "epubcfi(/6/8)" } },
  };
}

function progressIntent(bookId: string): ReaderOutboxIntent {
  return {
    type: "replace-progress",
    namespaceKey: "account-a",
    bookId,
    serverSessionId: null,
    intentRevision: 1,
    progress: { cfi: "epubcfi(/6/8)", percentage: 40, locationLabel: "040% - Chapter" },
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
