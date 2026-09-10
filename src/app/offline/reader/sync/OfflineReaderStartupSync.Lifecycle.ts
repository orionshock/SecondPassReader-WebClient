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

export type OfflineReaderStartupSyncDependencies = {
  getConnectivitySnapshot(): BrowserConnectivityStatus;
  subscribeConnectivity(listener: () => void): () => void;
  syncPending(input: {
    namespaceKey: string;
    client: OfflineReaderSyncClient;
    isCurrent(): boolean;
    onCompleted?: (result: Extract<OfflineReaderPendingSyncResult, { status: "completed" }>) => void;
  }): Promise<OfflineReaderPendingSyncResult>;
};

type StartupLifecycleInput = {
  namespaceKey: string | null;
  client: OfflineReaderSyncClient | null;
  isCurrent?: () => boolean;
  onEligibilityDecided?: () => void;
  onSweepCompleted?: (result: Extract<OfflineReaderPendingSyncResult, { status: "completed" }>) => void;
};

export function startOfflineReaderStartupSyncLifecycle(
  input: StartupLifecycleInput,
  dependencyOverrides: Partial<OfflineReaderStartupSyncDependencies> = {},
): () => void {
  const namespaceKey = input.namespaceKey?.trim() ?? "";
  if (!namespaceKey || !input.client) return () => undefined;

  const dependencies: OfflineReaderStartupSyncDependencies = {
    getConnectivitySnapshot: getBrowserConnectivitySnapshot,
    subscribeConnectivity: subscribeToBrowserConnectivity,
    syncPending: syncPendingOfflineReaderWork,
    ...dependencyOverrides,
  };
  const client = input.client;
  const generationIsCurrent = input.isCurrent ?? (() => true);
  let disposed = false;
  let decided = false;
  let unsubscribe: () => void = () => undefined;

  const decide = (status: BrowserConnectivityStatus) => {
    if (decided || disposed || status === "unknown" || !generationIsCurrent()) return;
    decided = true;
    unsubscribe();
    input.onEligibilityDecided?.();
    if (status !== "online") return;
    void dependencies.syncPending({
      namespaceKey,
      client,
      isCurrent: () => !disposed && generationIsCurrent(),
      onCompleted: input.onSweepCompleted,
    });
  };

  const initialStatus = dependencies.getConnectivitySnapshot();
  if (initialStatus === "unknown") {
    unsubscribe = dependencies.subscribeConnectivity(() => decide(dependencies.getConnectivitySnapshot()));
  } else {
    decide(initialStatus);
  }

  return () => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
  };
}
