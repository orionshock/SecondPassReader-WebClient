import type {
  OfflineProjectionRecord,
  OfflineProjectionRepository,
} from "./OfflineRepositories.Types";
import {
  deleteNamespaceRecords,
  OFFLINE_STORE_NAMES,
  requestResult,
  runTransaction,
} from "./IndexedDbOfflineDatabase.Adapter";

export class IndexedDbOfflineProjectionRepository implements OfflineProjectionRepository {
  constructor(private readonly database: IDBDatabase) {}

  async get<T>(namespaceKey: string, projectionKey: string): Promise<OfflineProjectionRecord<T> | null> {
    const transaction = this.database.transaction(OFFLINE_STORE_NAMES.projections, "readonly");
    const record = await runTransaction(transaction, () => (
      requestResult<OfflineProjectionRecord<T> | undefined>(
        transaction.objectStore(OFFLINE_STORE_NAMES.projections).get([namespaceKey, projectionKey]),
      )
    ));
    return record ?? null;
  }

  async put<T>(record: OfflineProjectionRecord<T>): Promise<void> {
    const transaction = this.database.transaction(OFFLINE_STORE_NAMES.projections, "readwrite");
    await runTransaction(transaction, () => (
      requestResult(transaction.objectStore(OFFLINE_STORE_NAMES.projections).put(record))
    ));
  }

  async delete(namespaceKey: string, projectionKey: string): Promise<void> {
    const transaction = this.database.transaction(OFFLINE_STORE_NAMES.projections, "readwrite");
    await runTransaction(transaction, () => (
      requestResult(transaction.objectStore(OFFLINE_STORE_NAMES.projections).delete([namespaceKey, projectionKey]))
    ));
  }

  deleteNamespace(namespaceKey: string): Promise<void> {
    return deleteNamespaceRecords(this.database, OFFLINE_STORE_NAMES.projections, namespaceKey);
  }
}
