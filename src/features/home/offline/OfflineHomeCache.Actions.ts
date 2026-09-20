import type { MarginaliaRecentSession, Shelf } from "@secondpass/client";
import type { OfflineClock } from "../../../app/offline/OfflineClock.Types";
import {
  openIndexedDbOfflineRepositories,
  type IndexedDbOfflineRepositories,
} from "../../../app/offline/storage/IndexedDbOfflineRepositories.Factory";
import {
  publishOfflineProjection,
  type OfflineNamespacePublicationLease,
} from "../../../app/offline/namespace/OfflineNamespacePublication.Lifecycle";
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
}, publication: OfflineNamespacePublicationLease, overrides: Partial<CacheDependencies> = {}): Promise<void> {
  return cacheProjection({
    namespaceKey: input.namespaceKey,
    projectionKey: OFFLINE_HOME_RECENT_PROJECTION_KEY,
    value: { items: input.items },
  }, publication, overrides);
}

export function cacheOfflineHomeShelves(input: {
  namespaceKey: string;
  items: Shelf[];
}, publication: OfflineNamespacePublicationLease, overrides: Partial<CacheDependencies> = {}): Promise<void> {
  return cacheProjection({
    namespaceKey: input.namespaceKey,
    projectionKey: OFFLINE_HOME_SHELVES_PROJECTION_KEY,
    value: { items: input.items },
  }, publication, overrides);
}

async function cacheProjection<T>(
  input: { namespaceKey: string; projectionKey: string; value: T },
  publication: OfflineNamespacePublicationLease,
  overrides: Partial<CacheDependencies>,
): Promise<void> {
  const namespaceKey = input.namespaceKey.trim();
  if (!namespaceKey || publication.namespaceKey !== namespaceKey) return;
  const dependencies: CacheDependencies = {
    openRepositories: async () => {
      return openIndexedDbOfflineRepositories<Blob>();
    },
    clock: { now: () => Date.now() },
    ...overrides,
  };
  if (!publication.isCurrent()) return;
  const repositories = await dependencies.openRepositories();
  try {
    await publishOfflineProjection({
      lease: publication,
      repository: repositories.projections,
      record: {
        namespaceKey,
        projectionKey: input.projectionKey,
        value: input.value,
        fetchedAt: dependencies.clock.now(),
        schemaVersion: OFFLINE_HOME_PROJECTION_SCHEMA_VERSION,
      },
    });
  } finally {
    repositories.close();
  }
}
