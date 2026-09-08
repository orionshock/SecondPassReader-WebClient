import type {
  OfflineEpubAssetRepository,
  OfflineProjectionRepository,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "./OfflineRepositories.Types";
import {
  openOfflineDatabase,
  type OfflineDatabaseOptions,
} from "./OfflineDatabase.IndexedDb";
import { IndexedDbOfflineEpubAssetRepository } from "./OfflineEpubAsset.IndexedDbRepository";
import { IndexedDbOfflineProjectionRepository } from "./OfflineProjection.IndexedDbRepository";
import { IndexedDbOfflineReaderStateRepository } from "./OfflineReaderState.IndexedDbRepository";
import { IndexedDbReaderOutboxRepository } from "./ReaderOutbox.IndexedDbRepository";

export type IndexedDbOfflineRepositories<TAssetPayload = Blob> = {
  projections: OfflineProjectionRepository;
  epubAssets: OfflineEpubAssetRepository<TAssetPayload>;
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
    epubAssets: new IndexedDbOfflineEpubAssetRepository<TAssetPayload>(database),
    readerState: new IndexedDbOfflineReaderStateRepository(database),
    readerOutbox: new IndexedDbReaderOutboxRepository(database),
    close: () => database.close(),
  };
}
