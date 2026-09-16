import { describe, expect, it, vi } from "vitest";
import type { BrowserConnectivityStatus } from "../../../../app/connectivity/BrowserConnectivity.State";
import {
  createOfflineReaderAuthenticatedSyncGeneration,
  startOfflineReaderAuthenticatedSyncLifecycle,
  type OfflineReaderAuthenticatedSyncDependencies,
} from "../../../../app/offline/reader/sync/OfflineReaderAuthenticatedSync.Lifecycle";
import type { OfflineReaderSyncClient } from "../../../../app/offline/reader/sync/OfflineReaderSync.Actions";

describe("authenticated offline Reader sync lifecycle", () => {
  it("runs online startup once for an authenticated generation", () => {
    const harness = createHarness("online");
    const generation = createOfflineReaderAuthenticatedSyncGeneration();

    const firstStop = harness.start({ generation });
    firstStop();
    const secondStop = harness.start({ generation });

    expect(harness.syncPending).toHaveBeenCalledOnce();
    expect(harness.syncPending).toHaveBeenCalledWith(expect.objectContaining({
      namespaceKey: "account-a",
      client: harness.client,
    }));
    expect(harness.startRetryScheduler).toHaveBeenCalledTimes(2);
    secondStop();
  });

  it("declines offline startup and requests sync on the later reconnect", () => {
    const harness = createHarness("offline");
    const stop = harness.start();

    expect(harness.syncPending).not.toHaveBeenCalled();
    harness.connectivity.emit("online");

    expect(harness.syncPending).toHaveBeenCalledOnce();
    stop();
  });

  it("treats unknown-to-online as startup, then handles later reconnects", () => {
    const harness = createHarness("unknown");
    const stop = harness.start();

    harness.connectivity.emit("unknown");
    harness.connectivity.emit("online");
    harness.connectivity.emit("online");
    expect(harness.syncPending).toHaveBeenCalledOnce();

    harness.connectivity.emit("offline");
    harness.connectivity.emit("online");
    expect(harness.syncPending).toHaveBeenCalledTimes(2);
    stop();
  });

  it("treats unknown-to-offline as the startup decision before reconnect", () => {
    const harness = createHarness("unknown");
    const stop = harness.start();

    harness.connectivity.emit("offline");
    expect(harness.syncPending).not.toHaveBeenCalled();
    harness.connectivity.emit("online");

    expect(harness.syncPending).toHaveBeenCalledOnce();
    stop();
  });

  it("uses one connectivity subscription and ignores online-to-online", () => {
    const harness = createHarness("online");
    const stop = harness.start();

    expect(harness.connectivity.subscriberCount).toBe(1);
    harness.connectivity.emit("online");
    expect(harness.syncPending).toHaveBeenCalledOnce();

    stop();
    expect(harness.connectivity.subscriberCount).toBe(0);
  });

  it("invalidates the old generation before a namespace replacement", () => {
    const harness = createHarness("offline");
    const oldGeneration = createOfflineReaderAuthenticatedSyncGeneration();
    const stopOld = harness.start({ namespaceKey: "account-a", generation: oldGeneration });
    stopOld();

    const newGeneration = createOfflineReaderAuthenticatedSyncGeneration();
    const stopNew = harness.start({ namespaceKey: "account-b", generation: newGeneration });
    harness.connectivity.emit("online");

    expect(harness.syncPending).toHaveBeenCalledOnce();
    expect(harness.syncPending.mock.calls[0][0].namespaceKey).toBe("account-b");
    expect(oldGeneration.active).toBe(false);
    expect(newGeneration.active).toBe(true);
    stopNew();
  });

  it("suppresses completion publication after cleanup", () => {
    const harness = createHarness("online");
    const onSweepCompleted = vi.fn();
    const stop = harness.start({ onSweepCompleted });
    const pendingInput = harness.syncPending.mock.calls[0][0];

    stop();
    pendingInput.onCompleted?.(completedSweep());

    expect(pendingInput.isCurrent()).toBe(false);
    expect(onSweepCompleted).not.toHaveBeenCalled();
    harness.connectivity.emit("offline");
    harness.connectivity.emit("online");
    expect(harness.syncPending).toHaveBeenCalledOnce();
  });

  it("publishes current completions and composes retry timing separately", () => {
    const harness = createHarness("online");
    const onSweepCompleted = vi.fn();
    const stop = harness.start({ onSweepCompleted });
    const pendingInput = harness.syncPending.mock.calls[0][0];
    const retryInput = harness.startRetryScheduler.mock.calls[0][0];
    const result = completedSweep();

    pendingInput.onCompleted?.(result);
    retryInput.onSweepCompleted?.(result);

    expect(onSweepCompleted).toHaveBeenCalledTimes(2);
    expect(retryInput.namespaceKey).toBe("account-a");
    expect(retryInput.isCurrent?.()).toBe(true);
    stop();
    expect(harness.stopRetryScheduler).toHaveBeenCalledOnce();
  });

  it("allows a new authenticated generation its own startup sweep", () => {
    const harness = createHarness("online");
    const stopFirst = harness.start({
      namespaceKey: "account-a",
      generation: createOfflineReaderAuthenticatedSyncGeneration(),
    });
    stopFirst();
    const stopSecond = harness.start({
      namespaceKey: "account-b",
      generation: createOfflineReaderAuthenticatedSyncGeneration(),
    });

    expect(harness.syncPending.mock.calls.map(([input]) => input.namespaceKey))
      .toEqual(["account-a", "account-b"]);
    stopSecond();
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

function createHarness(initial: BrowserConnectivityStatus) {
  const connectivity = new ControlledConnectivity(initial);
  const syncPending = vi.fn<OfflineReaderAuthenticatedSyncDependencies["syncPending"]>(
    async () => completedSweep(),
  );
  const stopRetryScheduler = vi.fn();
  const startRetryScheduler = vi.fn<OfflineReaderAuthenticatedSyncDependencies["startRetryScheduler"]>(
    () => stopRetryScheduler,
  );
  const dependencies: OfflineReaderAuthenticatedSyncDependencies = {
    getConnectivitySnapshot: connectivity.getSnapshot,
    subscribeConnectivity: connectivity.subscribe,
    syncPending,
    startRetryScheduler,
  };
  const syncClient = client();
  const start = (overrides: {
    namespaceKey?: string;
    generation?: ReturnType<typeof createOfflineReaderAuthenticatedSyncGeneration>;
    onSweepCompleted?: Parameters<typeof startOfflineReaderAuthenticatedSyncLifecycle>[0]["onSweepCompleted"];
  } = {}) => startOfflineReaderAuthenticatedSyncLifecycle({
    namespaceKey: overrides.namespaceKey ?? "account-a",
    client: syncClient,
    generation: overrides.generation ?? createOfflineReaderAuthenticatedSyncGeneration(),
    onSweepCompleted: overrides.onSweepCompleted,
  }, dependencies);
  return {
    client: syncClient,
    connectivity,
    start,
    startRetryScheduler,
    stopRetryScheduler,
    syncPending,
  };
}

function completedSweep() {
  return {
    status: "completed" as const,
    discoveredBooks: 0,
    attemptedBooks: 0,
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
    },
  };
}

function client(): OfflineReaderSyncClient {
  const unexpected = async () => {
    throw new Error("Authenticated lifecycle must delegate delivery to pending sync.");
  };
  return {
    marginalia: {
      books: { getActiveSession: unexpected, open: unexpected },
      sessions: { batchAnnotations: unexpected, replaceProgress: unexpected },
    },
  };
}
