import { describe, expect, it, vi } from "vitest";
import type { BrowserConnectivityStatus } from "../app/connectivity/BrowserConnectivity.State";
import {
  pendingReaderSyncBookIds,
  startOfflineReaderReconnectSyncLifecycle,
  type OfflineReaderReconnectSyncDependencies,
} from "../app/offline/OfflineReaderReconnectSync.Lifecycle";
import type { OfflineReaderCoordinatedSyncResult } from "../app/offline/OfflineReaderCoordinatedSync.Actions";
import type { ReaderOutboxIntent } from "../app/offline/ReaderOutbox.Policy";
import type { OfflineReaderSyncClient } from "../app/offline/OfflineReaderSync.Actions";
import { createInMemoryOfflineRepositoryFactories } from "./OfflineRepositoryTest.Fixtures";

describe("offline Reader reconnect sync lifecycle", () => {
  it("triggers only on offline-to-online transitions and allows a later pass", async () => {
    const harness = await createHarness("online", [establishIntent("book-1")]);
    const dispose = harness.start();

    harness.connectivity.emit("online");
    await settle();
    expect(harness.syncBook).not.toHaveBeenCalled();
    harness.connectivity.emit("offline");
    harness.connectivity.emit("online");
    await waitFor(() => harness.close.mock.calls.length === 1);
    expect(harness.syncBook).toHaveBeenCalledOnce();
    harness.connectivity.emit("online");
    await settle();
    expect(harness.syncBook).toHaveBeenCalledOnce();

    harness.connectivity.emit("offline");
    harness.connectivity.emit("online");
    await waitFor(() => harness.close.mock.calls.length === 2);
    expect(harness.syncBook).toHaveBeenCalledTimes(2);
    dispose();
  });

  it("does not treat unknown-to-online or initial online as reconnect", async () => {
    const harness = await createHarness("unknown", [establishIntent("book-1")]);
    const dispose = harness.start();

    harness.connectivity.emit("online");
    await settle();

    expect(harness.openRepositories).not.toHaveBeenCalled();
    expect(harness.syncBook).not.toHaveBeenCalled();
    dispose();
  });

  it("does nothing without a verified namespace or client", async () => {
    const harness = await createHarness("offline", [establishIntent("book-1")]);
    const withoutNamespace = harness.start({ namespaceKey: null });
    const withoutClient = harness.start({ client: null });

    harness.connectivity.emit("online");
    await settle();

    expect(harness.connectivity.subscriberCount).toBe(0);
    expect(harness.openRepositories).not.toHaveBeenCalled();
    withoutNamespace();
    withoutClient();
  });

  it("discovers one sorted Book per namespace across every Reader intent type", async () => {
    const intents = [
      progressIntent("book-3"),
      annotationIntent("book-2"),
      establishIntent("book-1"),
      annotationIntent("book-3", "annotation-2"),
    ];
    expect(pendingReaderSyncBookIds(intents)).toEqual(["book-1", "book-2", "book-3"]);
    const harness = await createHarness("offline", intents);
    const dispose = harness.start();

    harness.connectivity.emit("online");
    await waitFor(() => harness.close.mock.calls.length === 1);

    expect(harness.list).toHaveBeenCalledWith("account-a");
    expect(harness.syncBook.mock.calls.map(([input]) => input.bookId).sort())
      .toEqual(["book-1", "book-2", "book-3"]);
    expect(harness.syncBook.mock.calls.every(([input]) => (
      input.namespaceKey === "account-a" && input.mode === "if-available"
    ))).toBe(true);
    expect(harness.openRepositories).toHaveBeenCalledOnce();
    dispose();
  });

  it("opens and closes one repository bundle without syncing an empty outbox", async () => {
    const harness = await createHarness("offline", []);
    const dispose = harness.start();

    harness.connectivity.emit("online");
    await waitFor(() => harness.close.mock.calls.length === 1);

    expect(harness.openRepositories).toHaveBeenCalledOnce();
    expect(harness.syncBook).not.toHaveBeenCalled();
    dispose();
  });

  it("bounds independent Book work to three concurrent calls", async () => {
    const intents = Array.from({ length: 7 }, (_, index) => establishIntent(`book-${index + 1}`));
    const harness = await createHarness("offline", intents);
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
    const dispose = harness.start();

    harness.connectivity.emit("online");
    await waitFor(() => gates.length === 3);
    expect(harness.syncBook).toHaveBeenCalledTimes(3);
    while (harness.close.mock.calls.length === 0) {
      const pending = gates.filter((gate) => !gate.resolved);
      for (const gate of pending) gate.resolve(completed());
      await settle();
    }

    expect(harness.syncBook).toHaveBeenCalledTimes(7);
    expect(maximumActive).toBe(3);
    dispose();
  });

  it("ignores an overlapping reconnect pass and stops starting Books after disposal", async () => {
    const intents = Array.from({ length: 4 }, (_, index) => establishIntent(`book-${index + 1}`));
    const harness = await createHarness("offline", intents);
    const gate = deferred<OfflineReaderCoordinatedSyncResult>();
    harness.syncBook.mockImplementation(() => gate.promise);
    const dispose = harness.start();

    harness.connectivity.emit("online");
    await waitFor(() => harness.syncBook.mock.calls.length === 3);
    harness.connectivity.emit("offline");
    harness.connectivity.emit("online");
    expect(harness.openRepositories).toHaveBeenCalledOnce();
    dispose();
    gate.resolve(completed());
    await waitFor(() => harness.close.mock.calls.length === 1);

    expect(harness.syncBook).toHaveBeenCalledTimes(3);
    expect(harness.connectivity.subscriberCount).toBe(0);
  });

  it("shares the namespace pass guard across lifecycle instances", async () => {
    const harness = await createHarness("offline", [establishIntent("book-1")]);
    const firstDispose = harness.start();
    const secondDispose = harness.start();

    harness.connectivity.emit("online");
    await waitFor(() => harness.close.mock.calls.length === 1);

    expect(harness.openRepositories).toHaveBeenCalledOnce();
    expect(harness.syncBook).toHaveBeenCalledOnce();
    firstDispose();
    secondDispose();
  });

  it("keeps the pass stable across busy, normalized failure, and thrown Book results", async () => {
    const harness = await createHarness("offline", [
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
      if (bookId === "book-3") throw new Error("raw repository failure https://secret.invalid");
      return completed();
    });
    const dispose = harness.start();

    harness.connectivity.emit("online");
    await waitFor(() => harness.close.mock.calls.length === 1);

    expect(harness.syncBook).toHaveBeenCalledTimes(4);
    expect(harness.reportFailure).toHaveBeenCalledWith("sync-retry-later", "book-2");
    expect(harness.reportFailure).toHaveBeenCalledWith("sync-book", "book-3");
    expect(JSON.stringify(harness.reportFailure.mock.calls)).not.toContain("secret.invalid");
    dispose();
  });

  it("normalizes repository open and list failures without crashing", async () => {
    const openFailure = await createHarness("offline", []);
    openFailure.openRepositories.mockRejectedValue(new Error("raw open failure"));
    const disposeOpen = openFailure.start();
    openFailure.connectivity.emit("online");
    await waitFor(() => openFailure.reportFailure.mock.calls.length === 1);
    expect(openFailure.reportFailure).toHaveBeenCalledWith("open-repositories");
    disposeOpen();

    const listFailure = await createHarness("offline", []);
    listFailure.list.mockRejectedValue(new Error("raw list failure"));
    const disposeList = listFailure.start();
    listFailure.connectivity.emit("online");
    await waitFor(() => listFailure.close.mock.calls.length === 1);
    expect(listFailure.reportFailure).toHaveBeenCalledWith("list-outbox");
    disposeList();
  });
});

class ControlledConnectivity {
  private readonly listeners = new Set<() => void>();

  constructor(private status: BrowserConnectivityStatus) {}

  readonly getSnapshot = () => this.status;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  emit(status: BrowserConnectivityStatus): void {
    this.status = status;
    for (const listener of [...this.listeners]) listener();
  }

  get subscriberCount(): number {
    return this.listeners.size;
  }
}

async function createHarness(initial: BrowserConnectivityStatus, intents: ReaderOutboxIntent[]) {
  const factories = createInMemoryOfflineRepositoryFactories();
  const readerState = await factories.createReaderStateRepository();
  const readerOutbox = await factories.createReaderOutboxRepository();
  for (const intent of intents) await readerOutbox.upsertIntent(intent);
  const connectivity = new ControlledConnectivity(initial);
  const close = vi.fn();
  const list = vi.spyOn(readerOutbox, "list");
  const openRepositories = vi.fn(async () => ({ readerState, readerOutbox, close }));
  const syncBook = vi.fn<OfflineReaderReconnectSyncDependencies["syncBook"]>(async () => completed());
  const reportFailure = vi.fn<OfflineReaderReconnectSyncDependencies["reportFailure"]>();
  const dependencies: OfflineReaderReconnectSyncDependencies = {
    getConnectivitySnapshot: connectivity.getSnapshot,
    subscribeConnectivity: connectivity.subscribe,
    openRepositories,
    syncBook,
    reportFailure,
  };
  const start = (overrides: { namespaceKey?: string | null; client?: OfflineReaderSyncClient | null } = {}) => (
    startOfflineReaderReconnectSyncLifecycle({
      namespaceKey: overrides.namespaceKey === undefined ? "account-a" : overrides.namespaceKey,
      client: overrides.client === undefined ? client() : overrides.client,
    }, dependencies)
  );
  return { connectivity, close, list, openRepositories, syncBook, reportFailure, start };
}

function client(): OfflineReaderSyncClient {
  const unexpected = async () => {
    throw new Error("Reconnect lifecycle must delegate server work to coordinated sync.");
  };
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

function establishIntent(bookId: string): ReaderOutboxIntent {
  return { type: "establish-session", namespaceKey: "account-a", bookId };
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
    get resolved() {
      return settled;
    },
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
