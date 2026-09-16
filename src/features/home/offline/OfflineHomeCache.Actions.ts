import type { MarginaliaRecentSession, Shelf } from "@secondpass/client";
import type { OfflineClock } from "../../../app/offline/OfflineClock.Types";
import type { IndexedDbOfflineRepositories } from "../../../app/offline/storage/IndexedDbOfflineRepositories.Factory";
import type { OfflineProjectionRecord } from "../../../app/offline/storage/OfflineRepositories.Types";
import {
  publishOfflineHomeProjection,
  type OfflineHomeProjectionPublicationLease,
} from "../../../app/offline/namespace/OfflineHomeProjectionPublication.Lifecycle";
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
}, publication: OfflineHomeProjectionPublicationLease, overrides: Partial<CacheDependencies> = {}): Promise<void> {
  return cacheProjection({
    namespaceKey: input.namespaceKey,
    projectionKey: OFFLINE_HOME_RECENT_PROJECTION_KEY,
    value: { items: input.items },
  }, publication, overrides);
}

export function cacheOfflineHomeShelves(input: {
  namespaceKey: string;
  items: Shelf[];
}, publication: OfflineHomeProjectionPublicationLease, overrides: Partial<CacheDependencies> = {}): Promise<void> {
  return cacheProjection({
    namespaceKey: input.namespaceKey,
    projectionKey: OFFLINE_HOME_SHELVES_PROJECTION_KEY,
    value: { items: input.items },
  }, publication, overrides);
}

async function cacheProjection<T>(
  input: { namespaceKey: string; projectionKey: string; value: T },
  publication: OfflineHomeProjectionPublicationLease,
  overrides: Partial<CacheDependencies>,
): Promise<void> {
  const namespaceKey = input.namespaceKey.trim();
  if (!namespaceKey || publication.namespaceKey !== namespaceKey) return;
  const dependencies: CacheDependencies = {
    openRepositories: async () => {
      const module = await import("../../../app/offline/storage/IndexedDbOfflineRepositories.Factory");
      return module.openIndexedDbOfflineRepositories<Blob>();
    },
    clock: { now: () => Date.now() },
    ...overrides,
  };
  await publishOfflineHomeProjection(publication, async () => {
    const repositories = await dependencies.openRepositories();
    try {
      const previous = await repositories.projections.get<T>(namespaceKey, input.projectionKey);
      if (!publication.isCurrent()) return;
      const next: OfflineProjectionRecord<T> = {
        namespaceKey,
        projectionKey: input.projectionKey,
        value: input.value,
        fetchedAt: dependencies.clock.now(),
        schemaVersion: OFFLINE_HOME_PROJECTION_SCHEMA_VERSION,
      };
      await repositories.projections.put(next);
      if (!publication.isCurrent()) {
        // Invalidation can occur while IndexedDB is committing. Restore the prior projection so
        // obsolete Home work cannot recreate or replace cache state after its lifetime ends.
        if (previous) await repositories.projections.put(previous);
        else await repositories.projections.delete(namespaceKey, input.projectionKey);
      }
    } finally {
      repositories.close();
    }
  });
}
