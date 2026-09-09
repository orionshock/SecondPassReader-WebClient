import type { ReaderOutboxRepository } from "./OfflineRepositories.Types";
import {
  coalesceReaderIntent,
  readerIntentResourceKey,
  type ReaderOutboxIntent,
} from "./ReaderOutbox.Policy";
import {
  deleteNamespaceRecords,
  OFFLINE_STORE_NAMES,
  requestResult,
  runTransaction,
} from "./OfflineDatabase.IndexedDb";

type StoredReaderOutboxIntent = {
  namespaceKey: string;
  resourceKey: string;
  schemaVersion: number;
  intent: ReaderOutboxIntent;
};

export class IndexedDbReaderOutboxRepository implements ReaderOutboxRepository {
  constructor(private readonly database: IDBDatabase) {}

  async list(namespaceKey: string): Promise<ReaderOutboxIntent[]> {
    const transaction = this.database.transaction(OFFLINE_STORE_NAMES.readerOutbox, "readonly");
    const records = await runTransaction(transaction, () => (
      requestResult<StoredReaderOutboxIntent[]>(
        transaction.objectStore(OFFLINE_STORE_NAMES.readerOutbox).index("namespaceKey").getAll(namespaceKey),
      )
    ));
    return records.map((record) => record.intent);
  }

  async upsertIntent(intent: ReaderOutboxIntent): Promise<void> {
    const resourceKey = readerIntentResourceKey(intent);
    const key = [intent.namespaceKey, resourceKey];
    const transaction = this.database.transaction(OFFLINE_STORE_NAMES.readerOutbox, "readwrite");
    const store = transaction.objectStore(OFFLINE_STORE_NAMES.readerOutbox);
    await runTransaction(transaction, async () => {
      const current = await requestResult<StoredReaderOutboxIntent | undefined>(store.get(key));
      const coalesced = coalesceReaderIntent(current ? [current.intent] : [], intent);

      if (coalesced.length === 0) {
        await requestResult(store.delete(key));
      } else {
        await requestResult(store.put({
          namespaceKey: intent.namespaceKey,
          resourceKey,
          schemaVersion: 1,
          intent: coalesced[0],
        }));
      }
    });
  }

  async remove(namespaceKey: string, resourceKey: string, expectedRevision: number | null): Promise<boolean> {
    const key = [namespaceKey, resourceKey];
    const transaction = this.database.transaction(OFFLINE_STORE_NAMES.readerOutbox, "readwrite");
    const store = transaction.objectStore(OFFLINE_STORE_NAMES.readerOutbox);
    return runTransaction(transaction, async () => {
      const current = await requestResult<StoredReaderOutboxIntent | undefined>(store.get(key));
      const currentRevision = current && "intentRevision" in current.intent
        ? current.intent.intentRevision
        : null;

      if (!current || currentRevision !== expectedRevision) return false;
      await requestResult(store.delete(key));
      return true;
    });
  }

  async replace(
    namespaceKey: string,
    resourceKey: string,
    expectedRevision: number | null,
    replacement: ReaderOutboxIntent,
  ): Promise<boolean> {
    if (replacement.namespaceKey !== namespaceKey) return false;
    const currentKey = [namespaceKey, resourceKey];
    const replacementResourceKey = readerIntentResourceKey(replacement);
    const transaction = this.database.transaction(OFFLINE_STORE_NAMES.readerOutbox, "readwrite");
    const store = transaction.objectStore(OFFLINE_STORE_NAMES.readerOutbox);
    return runTransaction(transaction, async () => {
      const current = await requestResult<StoredReaderOutboxIntent | undefined>(store.get(currentKey));
      const currentRevision = current && "intentRevision" in current.intent
        ? current.intent.intentRevision
        : null;
      if (!current || currentRevision !== expectedRevision) return false;

      await requestResult(store.put({
        namespaceKey,
        resourceKey: replacementResourceKey,
        schemaVersion: 1,
        intent: replacement,
      }));
      if (replacementResourceKey !== resourceKey) await requestResult(store.delete(currentKey));
      return true;
    });
  }

  deleteNamespace(namespaceKey: string): Promise<void> {
    return deleteNamespaceRecords(this.database, OFFLINE_STORE_NAMES.readerOutbox, namespaceKey);
  }
}
