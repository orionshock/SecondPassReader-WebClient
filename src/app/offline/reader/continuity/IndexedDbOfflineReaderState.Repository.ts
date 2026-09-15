import type {
  OfflineReaderBookState,
  OfflineReaderStateRepository,
} from "../../storage/OfflineRepositories.Types";
import {
  deleteNamespaceRecords,
  OFFLINE_STORE_NAMES,
  requestResult,
  runTransaction,
} from "../../storage/IndexedDbOfflineDatabase.Adapter";

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

  async updateBookState(
    namespaceKey: string,
    bookId: string,
    mutation: (current: OfflineReaderBookState) => OfflineReaderBookState,
  ) {
    // Reader state is one shared durable record with independent writers. Its read/modify/write
    // must stay in one transaction so a writer cannot erase sibling fields committed by another tab.
    const transaction = this.database.transaction(OFFLINE_STORE_NAMES.readerState, "readwrite");
    const result = await runTransaction(transaction, async () => {
      const store = transaction.objectStore(OFFLINE_STORE_NAMES.readerState);
      const current = await requestResult<OfflineReaderBookState | undefined>(
        store.get([namespaceKey, bookId]),
      );
      if (!current) return { status: "missing" } as const;
      const next = mutation(current);
      if (next.namespaceKey !== namespaceKey || next.bookId !== bookId) {
        throw new Error("Reader state mutation cannot change record identity.");
      }
      await requestResult(store.put(next));
      return { status: "committed", state: next } as const;
    });
    return structuredClone(result);
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
