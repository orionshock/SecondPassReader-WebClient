import type { MarginaliaRecentSession, Shelf } from "@secondpass/client";
import type { OfflineClock } from "../../../app/offline/OfflineClock.Types";
import type { IndexedDbOfflineRepositories } from "../../../app/offline/storage/IndexedDbOfflineRepositories.Factory";
import {
  OFFLINE_HOME_PROJECTION_SCHEMA_VERSION,
  OFFLINE_HOME_RECENT_PROJECTION_KEY,
  OFFLINE_HOME_SHELVES_PROJECTION_KEY,
} from "./OfflineHome.Constants";

type CacheDependencies = {
  openRepositories(): Promise<IndexedDbOfflineRepositories<Blob>>;
  clock: OfflineClock;
};

export function cacheOfflineHomeRecent(input: {
  namespaceKey: string;
  items: MarginaliaRecentSession[];
}, overrides: Partial<CacheDependencies> = {}): Promise<void> {
  return cacheProjection({
    namespaceKey: input.namespaceKey,
    projectionKey: OFFLINE_HOME_RECENT_PROJECTION_KEY,
    value: { items: input.items },
  }, overrides);
}

export function cacheOfflineHomeShelves(input: {
  namespaceKey: string;
  items: Shelf[];
}, overrides: Partial<CacheDependencies> = {}): Promise<void> {
  return cacheProjection({
    namespaceKey: input.namespaceKey,
    projectionKey: OFFLINE_HOME_SHELVES_PROJECTION_KEY,
    value: { items: input.items },
  }, overrides);
}

async function cacheProjection<T>(
  input: { namespaceKey: string; projectionKey: string; value: T },
  overrides: Partial<CacheDependencies>,
): Promise<void> {
  const namespaceKey = input.namespaceKey.trim();
  if (!namespaceKey) return;
  const dependencies: CacheDependencies = {
    openRepositories: async () => {
      const module = await import("../../../app/offline/storage/IndexedDbOfflineRepositories.Factory");
      return module.openIndexedDbOfflineRepositories<Blob>();
    },
    clock: { now: () => Date.now() },
    ...overrides,
  };
  const repositories = await dependencies.openRepositories();
  try {
    await repositories.projections.put({
      namespaceKey,
      projectionKey: input.projectionKey,
      value: input.value,
      fetchedAt: dependencies.clock.now(),
      schemaVersion: OFFLINE_HOME_PROJECTION_SCHEMA_VERSION,
    });
  } finally {
    repositories.close();
  }
}
