import type {
  OfflineEpubAssetCompleteRecord,
  OfflineEpubAssetRepository,
} from "./OfflineRepositories.Types";
import {
  deleteNamespaceRecords,
  OFFLINE_STORE_NAMES,
  requestResult,
  runTransaction,
} from "./OfflineDatabase.IndexedDb";

export class IndexedDbOfflineEpubAssetRepository<TPayload = Blob>
implements OfflineEpubAssetRepository<TPayload> {
  constructor(private readonly database: IDBDatabase) {}

  async get(namespaceKey: string, bookId: string): Promise<OfflineEpubAssetCompleteRecord<TPayload> | null> {
    const transaction = this.database.transaction(OFFLINE_STORE_NAMES.epubAssets, "readonly");
    const record = await runTransaction(transaction, () => (
      requestResult<OfflineEpubAssetCompleteRecord<TPayload> | undefined>(
        transaction.objectStore(OFFLINE_STORE_NAMES.epubAssets).get([namespaceKey, bookId]),
      )
    ));
    return record ?? null;
  }

  async putComplete(record: OfflineEpubAssetCompleteRecord<TPayload>): Promise<void> {
    const transaction = this.database.transaction(OFFLINE_STORE_NAMES.epubAssets, "readwrite");
    await runTransaction(transaction, () => (
      requestResult(transaction.objectStore(OFFLINE_STORE_NAMES.epubAssets).put(record))
    ));
  }

  async delete(namespaceKey: string, bookId: string): Promise<void> {
    const transaction = this.database.transaction(OFFLINE_STORE_NAMES.epubAssets, "readwrite");
    await runTransaction(transaction, () => (
      requestResult(transaction.objectStore(OFFLINE_STORE_NAMES.epubAssets).delete([namespaceKey, bookId]))
    ));
  }

  deleteNamespace(namespaceKey: string): Promise<void> {
    return deleteNamespaceRecords(this.database, OFFLINE_STORE_NAMES.epubAssets, namespaceKey);
  }
}
