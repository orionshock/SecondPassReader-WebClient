import type {
  OfflineReaderBookState,
  OfflineReaderStateRepository,
} from "./OfflineRepositories.Types";
import {
  deleteNamespaceRecords,
  OFFLINE_STORE_NAMES,
  requestResult,
  runTransaction,
} from "./IndexedDbOfflineDatabase.Adapter";

export class IndexedDbOfflineReaderStateRepository implements OfflineReaderStateRepository {
  constructor(private readonly database: IDBDatabase) {}

  async getBookState(namespaceKey: string, bookId: string): Promise<OfflineReaderBookState | null> {
    const transaction = this.database.transaction(OFFLINE_STORE_NAMES.readerState, "readonly");
    const state = await runTransaction(transaction, () => (
      requestResult<OfflineReaderBookState | undefined>(
        transaction.objectStore(OFFLINE_STORE_NAMES.readerState).get([namespaceKey, bookId]),
      )
    ));
    return state ?? null;
  }

  async putBookState(state: OfflineReaderBookState): Promise<void> {
    const transaction = this.database.transaction(OFFLINE_STORE_NAMES.readerState, "readwrite");
    await runTransaction(transaction, () => (
      requestResult(transaction.objectStore(OFFLINE_STORE_NAMES.readerState).put(state))
    ));
  }

  async deleteBookState(namespaceKey: string, bookId: string): Promise<void> {
    const transaction = this.database.transaction(OFFLINE_STORE_NAMES.readerState, "readwrite");
    await runTransaction(transaction, () => (
      requestResult(transaction.objectStore(OFFLINE_STORE_NAMES.readerState).delete([namespaceKey, bookId]))
    ));
  }

  deleteNamespace(namespaceKey: string): Promise<void> {
    return deleteNamespaceRecords(this.database, OFFLINE_STORE_NAMES.readerState, namespaceKey);
  }
}
