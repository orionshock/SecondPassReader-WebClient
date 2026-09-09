import { describe, expect, it, vi } from "vitest";
import type { BrowserConnectivityStatus } from "../app/connectivity/BrowserConnectivity.State";
import {
  startOfflineReaderStartupSyncLifecycle,
  type OfflineReaderStartupSyncDependencies,
} from "../app/offline/OfflineReaderStartupSync.Lifecycle";
import type { OfflineReaderSyncClient } from "../app/offline/OfflineReaderSync.Actions";

describe("offline Reader startup sync lifecycle", () => {
  it("runs one catch-up for an authenticated generation starting online", () => {
    const harness = createHarness("online");
    const dispose = harness.start();

    expect(harness.syncPending).toHaveBeenCalledOnce();
    expect(harness.eligibilityDecided).toHaveBeenCalledOnce();
    expect(harness.syncPending.mock.calls[0][0]).toMatchObject({ namespaceKey: "account-a" });
    expect(harness.syncPending.mock.calls[0][0].isCurrent()).toBe(true);
    expect(harness.connectivity.subscriberCount).toBe(0);
    dispose();
  });

  it("declines startup while initially offline and leaves reconnect ownership separate", () => {
    const harness = createHarness("offline");
    const dispose = harness.start();

    expect(harness.eligibilityDecided).toHaveBeenCalledOnce();
    expect(harness.syncPending).not.toHaveBeenCalled();
    harness.connectivity.emit("online");
    expect(harness.syncPending).not.toHaveBeenCalled();
    dispose();
  });

  it("waits through unknown and runs once when connectivity becomes online", () => {
    const harness = createHarness("unknown");
    const dispose = harness.start();

    expect(harness.connectivity.subscriberCount).toBe(1);
    harness.connectivity.emit("unknown");
    expect(harness.syncPending).not.toHaveBeenCalled();
    harness.connectivity.emit("online");
    harness.connectivity.emit("offline");
    harness.connectivity.emit("online");

    expect(harness.syncPending).toHaveBeenCalledOnce();
    expect(harness.eligibilityDecided).toHaveBeenCalledOnce();
    expect(harness.connectivity.subscriberCount).toBe(0);
    dispose();
  });

  it("treats unknown-to-offline as a completed startup decision", () => {
    const harness = createHarness("unknown");
    const dispose = harness.start();

    harness.connectivity.emit("offline");
    harness.connectivity.emit("online");

    expect(harness.eligibilityDecided).toHaveBeenCalledOnce();
    expect(harness.syncPending).not.toHaveBeenCalled();
    expect(harness.connectivity.subscriberCount).toBe(0);
    dispose();
  });

  it("does nothing without verified namespace and client context", () => {
    const harness = createHarness("online");
    const withoutNamespace = harness.start({ namespaceKey: null });
    const withoutClient = harness.start({ client: null });

    expect(harness.syncPending).not.toHaveBeenCalled();
    expect(harness.eligibilityDecided).not.toHaveBeenCalled();
    withoutNamespace();
    withoutClient();
  });

  it("disposal prevents an unresolved startup generation from beginning work", () => {
    const harness = createHarness("unknown");
    const dispose = harness.start();

    dispose();
    harness.connectivity.emit("online");

    expect(harness.syncPending).not.toHaveBeenCalled();
    expect(harness.connectivity.subscriberCount).toBe(0);
  });

  it("allows a separate verified namespace generation to catch up", () => {
    const first = createHarness("online");
    const second = createHarness("online");
    const stopFirst = first.start({ namespaceKey: "account-a" });
    const stopSecond = second.start({ namespaceKey: "account-b" });

    expect(first.syncPending).toHaveBeenCalledWith(expect.objectContaining({ namespaceKey: "account-a" }));
    expect(second.syncPending).toHaveBeenCalledWith(expect.objectContaining({ namespaceKey: "account-b" }));
    stopFirst();
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
  const syncPending = vi.fn<OfflineReaderStartupSyncDependencies["syncPending"]>(
    async () => ({ status: "completed", discoveredBooks: 0, attemptedBooks: 0 }),
  );
  const eligibilityDecided = vi.fn();
  const dependencies: OfflineReaderStartupSyncDependencies = {
    getConnectivitySnapshot: connectivity.getSnapshot,
    subscribeConnectivity: connectivity.subscribe,
    syncPending,
  };
  const start = (overrides: {
    namespaceKey?: string | null;
    client?: OfflineReaderSyncClient | null;
  } = {}) => startOfflineReaderStartupSyncLifecycle({
    namespaceKey: overrides.namespaceKey === undefined ? "account-a" : overrides.namespaceKey,
    client: overrides.client === undefined ? client() : overrides.client,
    onEligibilityDecided: eligibilityDecided,
  }, dependencies);
  return { connectivity, syncPending, eligibilityDecided, start };
}

function client(): OfflineReaderSyncClient {
  const unexpected = async () => {
    throw new Error("Startup lifecycle must delegate delivery to pending sync.");
  };
  return {
    marginalia: {
      books: { getActiveSession: unexpected, open: unexpected },
      sessions: { batchAnnotations: unexpected, replaceProgress: unexpected },
    },
  };
}
