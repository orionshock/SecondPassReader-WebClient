import type {
  OfflinePublicationAssetRepository,
  OfflinePublicationCoverRepository,
  OfflineProjectionRepository,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "./OfflineRepositories.Types";
import {
  openOfflineDatabase,
  type OfflineDatabaseOptions,
} from "./IndexedDbOfflineDatabase.Adapter";
import { IndexedDbOfflinePublicationAssetRepository } from "../publication/IndexedDbOfflinePublicationAsset.Repository";
import { IndexedDbOfflinePublicationCoverRepository } from "../publication/IndexedDbOfflinePublicationCover.Repository";
import { IndexedDbOfflineProjectionRepository } from "./IndexedDbOfflineProjection.Repository";
import { IndexedDbOfflineReaderStateRepository } from "../reader/continuity/IndexedDbOfflineReaderState.Repository";
import { IndexedDbReaderOutboxRepository } from "../reader/outbox/IndexedDbReaderOutbox.Repository";
import {
  IndexedDbOfflineReaderAnnotationContinuationRepository,
} from "../reader/replay/IndexedDbOfflineReaderAnnotationContinuation.Repository";
import type {
  ReaderAnnotationContinuationRepository,
} from "../reader/replay/OfflineReaderAnnotationContinuation.Actions";

export type IndexedDbOfflineRepositories<TAssetPayload = Blob> = {
  projections: OfflineProjectionRepository;
  publicationAssets: OfflinePublicationAssetRepository<TAssetPayload>;
  publicationCovers: OfflinePublicationCoverRepository<TAssetPayload>;
  readerState: OfflineReaderStateRepository;
  readerOutbox: ReaderOutboxRepository;
  readerAnnotationContinuation: ReaderAnnotationContinuationRepository;
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
    readerAnnotationContinuation: new IndexedDbOfflineReaderAnnotationContinuationRepository(database),
    close: () => database.close(),
  };
}
