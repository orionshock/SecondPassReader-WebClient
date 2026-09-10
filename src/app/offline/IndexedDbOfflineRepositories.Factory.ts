import type {
  OfflinePublicationAssetRepository,
  OfflineProjectionRepository,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "./OfflineRepositories.Types";
import {
  openOfflineDatabase,
  type OfflineDatabaseOptions,
} from "./IndexedDbOfflineDatabase.Adapter";
import { IndexedDbOfflinePublicationAssetRepository } from "./IndexedDbOfflinePublicationAsset.Repository";
import { IndexedDbOfflineProjectionRepository } from "./IndexedDbOfflineProjection.Repository";
import { IndexedDbOfflineReaderStateRepository } from "./IndexedDbOfflineReaderState.Repository";
import { IndexedDbReaderOutboxRepository } from "./IndexedDbReaderOutbox.Repository";

export type IndexedDbOfflineRepositories<TAssetPayload = Blob> = {
  projections: OfflineProjectionRepository;
  publicationAssets: OfflinePublicationAssetRepository<TAssetPayload>;
  readerState: OfflineReaderStateRepository;
  readerOutbox: ReaderOutboxRepository;
  close(): void;
};

export async function openIndexedDbOfflineRepositories<TAssetPayload = Blob>(
  options: OfflineDatabaseOptions = {},
): Promise<IndexedDbOfflineRepositories<TAssetPayload>> {
  const database = await openOfflineDatabase(options);
  return {
    projections: new IndexedDbOfflineProjectionRepository(database),
    publicationAssets: new IndexedDbOfflinePublicationAssetRepository<TAssetPayload>(database),
    readerState: new IndexedDbOfflineReaderStateRepository(database),
    readerOutbox: new IndexedDbReaderOutboxRepository(database),
    close: () => database.close(),
  };
}
