import {
  startOfflineReaderReconnectSyncLifecycle,
} from "./OfflineReaderReconnectSync.Lifecycle";
import type { OfflineReaderSyncClient } from "./OfflineReaderSync.Actions";
import type { OfflineReaderPendingSyncResult } from "./OfflineReaderPendingSync.Actions";
import {
  startOfflineReaderStartupSyncLifecycle,
} from "./OfflineReaderStartupSync.Lifecycle";
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
  startReconnect: typeof startOfflineReaderReconnectSyncLifecycle;
  startStartup: typeof startOfflineReaderStartupSyncLifecycle;
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
    startReconnect: startOfflineReaderReconnectSyncLifecycle,
    startStartup: startOfflineReaderStartupSyncLifecycle,
    startRetryScheduler: startOfflineReaderRetrySchedulerLifecycle,
    ...dependencyOverrides,
  };
  input.generation.active = true;
  const isCurrent = () => input.generation.active;
  const stopReconnect = dependencies.startReconnect({
    namespaceKey: input.namespaceKey,
    client: input.client,
    isCurrent,
    onSweepCompleted: input.onSweepCompleted,
  });
  const stopStartup = input.generation.startupDecided
    ? () => undefined
    : dependencies.startStartup({
        namespaceKey: input.namespaceKey,
        client: input.client,
        isCurrent,
        onEligibilityDecided: () => {
          input.generation.startupDecided = true;
        },
        onSweepCompleted: input.onSweepCompleted,
      });
  const stopRetryScheduler = dependencies.startRetryScheduler({
    namespaceKey: input.namespaceKey,
    client: input.client,
    isCurrent,
    onSweepCompleted: input.onSweepCompleted,
  });

  return () => {
    input.generation.active = false;
    stopStartup();
    stopReconnect();
    stopRetryScheduler();
  };
}
