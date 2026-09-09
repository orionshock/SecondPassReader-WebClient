import {
  startOfflineReaderReconnectSyncLifecycle,
} from "./OfflineReaderReconnectSync.Lifecycle";
import type { OfflineReaderSyncClient } from "./OfflineReaderSync.Actions";
import {
  startOfflineReaderStartupSyncLifecycle,
} from "./OfflineReaderStartupSync.Lifecycle";

export type OfflineReaderAuthenticatedSyncGeneration = {
  active: boolean;
  startupDecided: boolean;
};

type AuthenticatedSyncInput = {
  namespaceKey: string;
  client: OfflineReaderSyncClient;
  generation: OfflineReaderAuthenticatedSyncGeneration;
};

export type OfflineReaderAuthenticatedSyncDependencies = {
  startReconnect: typeof startOfflineReaderReconnectSyncLifecycle;
  startStartup: typeof startOfflineReaderStartupSyncLifecycle;
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
    ...dependencyOverrides,
  };
  input.generation.active = true;
  const isCurrent = () => input.generation.active;
  const stopReconnect = dependencies.startReconnect({
    namespaceKey: input.namespaceKey,
    client: input.client,
    isCurrent,
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
      });

  return () => {
    input.generation.active = false;
    stopStartup();
    stopReconnect();
  };
}
