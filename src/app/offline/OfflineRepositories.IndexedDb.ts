import type {
  OfflinePublicationAssetRepository,
  OfflineProjectionRepository,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "./OfflineRepositories.Types";
import {
  openOfflineDatabase,
  type OfflineDatabaseOptions,
} from "./OfflineDatabase.IndexedDb";
import { IndexedDbOfflinePublicationAssetRepository } from "./OfflinePublicationAsset.IndexedDbRepository";
import { IndexedDbOfflineProjectionRepository } from "./OfflineProjection.IndexedDbRepository";
import { IndexedDbOfflineReaderStateRepository } from "./OfflineReaderState.IndexedDbRepository";
import { IndexedDbReaderOutboxRepository } from "./ReaderOutbox.IndexedDbRepository";

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
