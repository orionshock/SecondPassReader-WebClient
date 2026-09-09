import { describe, expect, it, vi } from "vitest";
import type { BrowserConnectivityStatus } from "../app/connectivity/BrowserConnectivity.State";
import {
  startOfflineReaderReconnectSyncLifecycle,
  type OfflineReaderReconnectSyncDependencies,
} from "../app/offline/OfflineReaderReconnectSync.Lifecycle";
import type { OfflineReaderSyncClient } from "../app/offline/OfflineReaderSync.Actions";

describe("offline Reader reconnect sync lifecycle", () => {
  it("triggers only on offline-to-online and allows a later reconnect", async () => {
    const harness = createHarness("online");
    const dispose = harness.start();

    harness.connectivity.emit("online");
    harness.connectivity.emit("offline");
    harness.connectivity.emit("online");
    expect(harness.syncPending).toHaveBeenCalledOnce();
    harness.connectivity.emit("online");
    expect(harness.syncPending).toHaveBeenCalledOnce();
    harness.connectivity.emit("offline");
    harness.connectivity.emit("online");
    expect(harness.syncPending).toHaveBeenCalledTimes(2);

    expect(harness.syncPending.mock.calls.every(([input]) => (
      input.namespaceKey === "account-a" && input.isCurrent()
    ))).toBe(true);
    dispose();
  });

  it("does not treat unknown-to-online as reconnect", () => {
    const harness = createHarness("unknown");
    const dispose = harness.start();

    harness.connectivity.emit("online");

    expect(harness.syncPending).not.toHaveBeenCalled();
    dispose();
  });

  it("does nothing without namespace or client", () => {
    const harness = createHarness("offline");
    const withoutNamespace = harness.start({ namespaceKey: null });
    const withoutClient = harness.start({ client: null });

    harness.connectivity.emit("online");

    expect(harness.connectivity.subscriberCount).toBe(0);
    expect(harness.syncPending).not.toHaveBeenCalled();
    withoutNamespace();
    withoutClient();
  });

  it("tears down and invalidates work for a disposed account generation", () => {
    const harness = createHarness("offline");
    let current = true;
    const dispose = harness.start({ isCurrent: () => current });

    current = false;
    harness.connectivity.emit("online");
    expect(harness.syncPending).not.toHaveBeenCalled();
    dispose();
    expect(harness.connectivity.subscriberCount).toBe(0);
    harness.connectivity.emit("offline");
    harness.connectivity.emit("online");
    expect(harness.syncPending).not.toHaveBeenCalled();
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
  const syncPending = vi.fn<OfflineReaderReconnectSyncDependencies["syncPending"]>(
    async () => ({ status: "completed", discoveredBooks: 0, attemptedBooks: 0 }),
  );
  const dependencies: OfflineReaderReconnectSyncDependencies = {
    getConnectivitySnapshot: connectivity.getSnapshot,
    subscribeConnectivity: connectivity.subscribe,
    syncPending,
  };
  const start = (overrides: {
    namespaceKey?: string | null;
    client?: OfflineReaderSyncClient | null;
    isCurrent?: () => boolean;
  } = {}) => startOfflineReaderReconnectSyncLifecycle({
    namespaceKey: overrides.namespaceKey === undefined ? "account-a" : overrides.namespaceKey,
    client: overrides.client === undefined ? client() : overrides.client,
    isCurrent: overrides.isCurrent,
  }, dependencies);
  return { connectivity, syncPending, start };
}

function client(): OfflineReaderSyncClient {
  const unexpected = async () => {
    throw new Error("Reconnect lifecycle must delegate delivery to pending sync.");
  };
  return {
    marginalia: {
      books: { getActiveSession: unexpected, open: unexpected },
      sessions: { batchAnnotations: unexpected, replaceProgress: unexpected },
    },
  };
}
