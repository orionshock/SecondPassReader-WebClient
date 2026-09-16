import type { BrowserConnectivityStatus } from "../../../connectivity/BrowserConnectivity.State";
import {
  getBrowserConnectivitySnapshot,
  subscribeToBrowserConnectivity,
} from "../../../connectivity/BrowserConnectivity.State";
import type { OfflineReaderSyncClient } from "./OfflineReaderSync.Actions";
import {
  syncPendingOfflineReaderWork,
  type OfflineReaderPendingSyncResult,
} from "./OfflineReaderPendingSync.Actions";
import { startOfflineReaderRetrySchedulerLifecycle } from "../retry/OfflineReaderRetryScheduler.Lifecycle";

export type OfflineReaderAuthenticatedSyncGeneration = {
  active: boolean;
  startupDecided: boolean;
};

type AuthenticatedSyncInput = {
  namespaceKey: string;
  client: OfflineReaderSyncClient;
  generation: OfflineReaderAuthenticatedSyncGeneration;
  onSweepCompleted?: (result: Extract<OfflineReaderPendingSyncResult, { status: "completed" }>) => void;
};

export type OfflineReaderAuthenticatedSyncDependencies = {
  getConnectivitySnapshot(): BrowserConnectivityStatus;
  subscribeConnectivity(listener: () => void): () => void;
  syncPending(input: {
    namespaceKey: string;
    client: OfflineReaderSyncClient;
    isCurrent(): boolean;
    onCompleted?: (result: Extract<OfflineReaderPendingSyncResult, { status: "completed" }>) => void;
  }): Promise<OfflineReaderPendingSyncResult>;
  startRetryScheduler: typeof startOfflineReaderRetrySchedulerLifecycle;
};

export function createOfflineReaderAuthenticatedSyncGeneration(): OfflineReaderAuthenticatedSyncGeneration {
  return { active: false, startupDecided: false };
}

export function startOfflineReaderAuthenticatedSyncLifecycle(
  input: AuthenticatedSyncInput,
  dependencyOverrides: Partial<OfflineReaderAuthenticatedSyncDependencies> = {},
): () => void {
  const dependencies: OfflineReaderAuthenticatedSyncDependencies = {
    getConnectivitySnapshot: getBrowserConnectivitySnapshot,
    subscribeConnectivity: subscribeToBrowserConnectivity,
    syncPending: syncPendingOfflineReaderWork,
    startRetryScheduler: startOfflineReaderRetrySchedulerLifecycle,
    ...dependencyOverrides,
  };
  input.generation.active = true;
  let disposed = false;
  let previousConnectivity = dependencies.getConnectivitySnapshot();
  const isCurrent = () => !disposed && input.generation.active;
  const publishCompleted = (result: Extract<OfflineReaderPendingSyncResult, { status: "completed" }>) => {
    if (isCurrent()) input.onSweepCompleted?.(result);
  };
  const requestSweep = () => {
    if (!isCurrent()) return;
    void dependencies.syncPending({
      namespaceKey: input.namespaceKey,
      client: input.client,
      isCurrent,
      onCompleted: publishCompleted,
    });
  };
  const decideStartup = (connectivity: BrowserConnectivityStatus): boolean => {
    if (input.generation.startupDecided || connectivity === "unknown" || !isCurrent()) return false;
    input.generation.startupDecided = true;
    if (connectivity === "online") requestSweep();
    return true;
  };

  // One authenticated generation owns startup and connectivity-transition decisions; durable
  // retry timing remains a separate lifecycle below this composition seam.
  const unsubscribeConnectivity = dependencies.subscribeConnectivity(() => {
    const nextConnectivity = dependencies.getConnectivitySnapshot();
    const reconnected = previousConnectivity === "offline" && nextConnectivity === "online";
    previousConnectivity = nextConnectivity;
    if (!isCurrent()) return;
    if (decideStartup(nextConnectivity)) return;
    if (reconnected) requestSweep();
  });
  decideStartup(previousConnectivity);

  const stopRetryScheduler = dependencies.startRetryScheduler({
    namespaceKey: input.namespaceKey,
    client: input.client,
    isCurrent,
    onSweepCompleted: publishCompleted,
  });

  return () => {
    if (disposed) return;
    disposed = true;
    input.generation.active = false;
    unsubscribeConnectivity();
    stopRetryScheduler();
  };
}
