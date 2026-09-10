import type { BrowserConnectivityStatus } from "../../../connectivity/BrowserConnectivity.State";
import {
  getBrowserConnectivitySnapshot,
  subscribeToBrowserConnectivity,
} from "../../../connectivity/BrowserConnectivity.State";
import {
  syncPendingOfflineReaderWork,
  type OfflineReaderPendingSyncResult,
} from "./OfflineReaderPendingSync.Actions";
import type { OfflineReaderSyncClient } from "./OfflineReaderSync.Actions";

export type OfflineReaderReconnectSyncDependencies = {
  getConnectivitySnapshot(): BrowserConnectivityStatus;
  subscribeConnectivity(listener: () => void): () => void;
  syncPending(input: {
    namespaceKey: string;
    client: OfflineReaderSyncClient;
    isCurrent(): boolean;
    onCompleted?: (result: Extract<OfflineReaderPendingSyncResult, { status: "completed" }>) => void;
  }): Promise<OfflineReaderPendingSyncResult>;
};

type ReconnectLifecycleInput = {
  namespaceKey: string | null;
  client: OfflineReaderSyncClient | null;
  isCurrent?: () => boolean;
  onSweepCompleted?: (result: Extract<OfflineReaderPendingSyncResult, { status: "completed" }>) => void;
};

export function startOfflineReaderReconnectSyncLifecycle(
  input: ReconnectLifecycleInput,
  dependencyOverrides: Partial<OfflineReaderReconnectSyncDependencies> = {},
): () => void {
  const namespaceKey = input.namespaceKey?.trim() ?? "";
  if (!namespaceKey || !input.client) return () => undefined;

  const dependencies: OfflineReaderReconnectSyncDependencies = {
    getConnectivitySnapshot: getBrowserConnectivitySnapshot,
    subscribeConnectivity: subscribeToBrowserConnectivity,
    syncPending: syncPendingOfflineReaderWork,
    ...dependencyOverrides,
  };
  const client = input.client;
  const generationIsCurrent = input.isCurrent ?? (() => true);
  let previousStatus = dependencies.getConnectivitySnapshot();
  let disposed = false;

  const unsubscribe = dependencies.subscribeConnectivity(() => {
    const nextStatus = dependencies.getConnectivitySnapshot();
    const reconnected = previousStatus === "offline" && nextStatus === "online";
    previousStatus = nextStatus;
    if (!reconnected || disposed || !generationIsCurrent()) return;
    void dependencies.syncPending({
      namespaceKey,
      client,
      isCurrent: () => !disposed && generationIsCurrent(),
      onCompleted: input.onSweepCompleted,
    });
  });

  return () => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
  };
}
