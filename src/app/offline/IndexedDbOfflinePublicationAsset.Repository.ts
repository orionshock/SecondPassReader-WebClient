import type {
  OfflinePublicationAssetCompleteRecord,
  OfflinePublicationAssetRepository,
} from "./OfflineRepositories.Types";
import {
  deleteNamespaceRecords,
  OFFLINE_STORE_NAMES,
  requestResult,
  runTransaction,
} from "./IndexedDbOfflineDatabase.Adapter";
import { publishOfflinePublicationAssetChange } from "./OfflinePublicationAssetChange.State";

export class IndexedDbOfflinePublicationAssetRepository<TPayload = Blob>
implements OfflinePublicationAssetRepository<TPayload> {
  constructor(private readonly database: IDBDatabase) {}

  async get(namespaceKey: string, bookId: string, format: string): Promise<OfflinePublicationAssetCompleteRecord<TPayload> | null> {
    const transaction = this.database.transaction(OFFLINE_STORE_NAMES.publicationAssets, "readonly");
    const record = await runTransaction(transaction, () => (
      requestResult<OfflinePublicationAssetCompleteRecord<TPayload> | undefined>(
        transaction.objectStore(OFFLINE_STORE_NAMES.publicationAssets).get([namespaceKey, bookId, format]),
      )
    ));
    return record ?? null;
  }

  async putComplete(record: OfflinePublicationAssetCompleteRecord<TPayload>): Promise<void> {
    const transaction = this.database.transaction(OFFLINE_STORE_NAMES.publicationAssets, "readwrite");
    await runTransaction(transaction, () => (
      requestResult(transaction.objectStore(OFFLINE_STORE_NAMES.publicationAssets).put(record))
    ));
    publishOfflinePublicationAssetChange(record.namespaceKey);
  }

  async list(namespaceKey: string): Promise<OfflinePublicationAssetCompleteRecord<TPayload>[]> {
    const transaction = this.database.transaction(OFFLINE_STORE_NAMES.publicationAssets, "readonly");
    return runTransaction(transaction, () => (
      requestResult<OfflinePublicationAssetCompleteRecord<TPayload>[]>(
        transaction.objectStore(OFFLINE_STORE_NAMES.publicationAssets).index("namespaceKey").getAll(namespaceKey),
      )
    ));
  }

  async delete(namespaceKey: string, bookId: string, format: string): Promise<void> {
    const transaction = this.database.transaction(OFFLINE_STORE_NAMES.publicationAssets, "readwrite");
    await runTransaction(transaction, () => (
      requestResult(transaction.objectStore(OFFLINE_STORE_NAMES.publicationAssets).delete([namespaceKey, bookId, format]))
    ));
    publishOfflinePublicationAssetChange(namespaceKey);
  }

  async deleteNamespace(namespaceKey: string): Promise<void> {
    await deleteNamespaceRecords(this.database, OFFLINE_STORE_NAMES.publicationAssets, namespaceKey);
    publishOfflinePublicationAssetChange(namespaceKey);
  }
}
