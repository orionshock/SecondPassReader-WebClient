import { IndexedDbLocalReaderAnnotationCommitRepository } from "../reader/annotations/IndexedDbLocalReaderAnnotationCommit.Repository";
import type { LocalReaderAnnotationCommitRepository } from "../reader/annotations/LocalReaderAnnotationCommit.Repository";
import type {
  OfflinePublicationAssetRepository,
  OfflinePublicationCoverRepository,
  OfflineProjectionRepository,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "./OfflineRepositories.Types";
import {
  deleteOfflineNamespaceRecords,
  openOfflineDatabase,
  type OfflineDatabaseOptions,
} from "./IndexedDbOfflineDatabase.Adapter";
import { IndexedDbOfflinePublicationAssetRepository } from "../publication/IndexedDbOfflinePublicationAsset.Repository";
import { IndexedDbOfflinePublicationCoverRepository } from "../publication/IndexedDbOfflinePublicationCover.Repository";
import { IndexedDbOfflineProjectionRepository } from "./IndexedDbOfflineProjection.Repository";
import { IndexedDbOfflineReaderStateRepository } from "../reader/continuity/IndexedDbOfflineReaderState.Repository";
import { IndexedDbReaderOutboxRepository } from "../reader/outbox/IndexedDbReaderOutbox.Repository";
import { publishOfflinePublicationAssetChange } from "../publication/OfflinePublicationAssetChange.State";
import { publishOfflineReaderOutboxChange } from "../reader/outbox/OfflineReaderOutboxChange.State";

export type IndexedDbOfflineRepositories<TAssetPayload = Blob> = {
  projections: OfflineProjectionRepository;
  publicationAssets: OfflinePublicationAssetRepository<TAssetPayload>;
  publicationCovers: OfflinePublicationCoverRepository<TAssetPayload>;
  readerState: OfflineReaderStateRepository;
  readerOutbox: ReaderOutboxRepository;
  readerAnnotationCommit: LocalReaderAnnotationCommitRepository;
  deleteNamespace(namespaceKey: string): Promise<void>;
  close(): void;
};

export async function openIndexedDbOfflineRepositories<TAssetPayload = Blob>(
  options: OfflineDatabaseOptions = {},
): Promise<IndexedDbOfflineRepositories<TAssetPayload>> {
  const database = await openOfflineDatabase(options);
  return {
    projections: new IndexedDbOfflineProjectionRepository(database),
    publicationAssets: new IndexedDbOfflinePublicationAssetRepository<TAssetPayload>(database),
    publicationCovers: new IndexedDbOfflinePublicationCoverRepository<TAssetPayload>(database),
    readerState: new IndexedDbOfflineReaderStateRepository(database),
    readerOutbox: new IndexedDbReaderOutboxRepository(database),
    readerAnnotationCommit: new IndexedDbLocalReaderAnnotationCommitRepository(database),
    deleteNamespace: async (namespaceKey) => {
      await deleteOfflineNamespaceRecords(database, namespaceKey);
      publishOfflinePublicationAssetChange(namespaceKey);
      publishOfflineReaderOutboxChange(namespaceKey);
    },
    close: () => database.close(),
  };
}
