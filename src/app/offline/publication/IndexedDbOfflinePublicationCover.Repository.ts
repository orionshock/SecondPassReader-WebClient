import type {
  OfflinePublicationCoverRecord,
  OfflinePublicationCoverRepository,
} from "../storage/OfflineRepositories.Types";
import {
  deleteNamespaceRecords,
  OFFLINE_STORE_NAMES,
  requestResult,
  runTransaction,
} from "../storage/IndexedDbOfflineDatabase.Adapter";
import { publishOfflinePublicationAssetChange } from "./OfflinePublicationAssetChange.State";

export class IndexedDbOfflinePublicationCoverRepository<TPayload = Blob>
implements OfflinePublicationCoverRepository<TPayload> {
  constructor(private readonly database: IDBDatabase) {}

  async get(namespaceKey: string, bookId: string): Promise<OfflinePublicationCoverRecord<TPayload> | null> {
    const transaction = this.database.transaction(OFFLINE_STORE_NAMES.publicationCovers, "readonly");
    const record = await runTransaction(transaction, () => (
      requestResult<OfflinePublicationCoverRecord<TPayload> | undefined>(
        transaction.objectStore(OFFLINE_STORE_NAMES.publicationCovers).get([namespaceKey, bookId]),
      )
    ));
    return record ?? null;
  }

  async put(record: OfflinePublicationCoverRecord<TPayload>): Promise<void> {
    const transaction = this.database.transaction(OFFLINE_STORE_NAMES.publicationCovers, "readwrite");
    await runTransaction(transaction, () => (
      requestResult(transaction.objectStore(OFFLINE_STORE_NAMES.publicationCovers).put(record))
    ));
    publishOfflinePublicationAssetChange(record.namespaceKey);
  }

  async delete(namespaceKey: string, bookId: string): Promise<void> {
    const transaction = this.database.transaction(OFFLINE_STORE_NAMES.publicationCovers, "readwrite");
    await runTransaction(transaction, () => (
      requestResult(transaction.objectStore(OFFLINE_STORE_NAMES.publicationCovers).delete([namespaceKey, bookId]))
    ));
    publishOfflinePublicationAssetChange(namespaceKey);
  }

  async deleteNamespace(namespaceKey: string): Promise<void> {
    await deleteNamespaceRecords(this.database, OFFLINE_STORE_NAMES.publicationCovers, namespaceKey);
    publishOfflinePublicationAssetChange(namespaceKey);
  }
}
