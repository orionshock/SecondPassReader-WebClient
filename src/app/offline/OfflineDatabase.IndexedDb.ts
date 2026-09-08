export const OFFLINE_DATABASE_NAME = "secondpass-reader-offline";
export const OFFLINE_DATABASE_VERSION = 1;

export const OFFLINE_STORE_NAMES = {
  projections: "projections",
  epubAssets: "epubAssets",
  readerState: "readerState",
  readerOutbox: "readerOutbox",
} as const;

const NAMESPACE_INDEX = "namespaceKey";

export type OfflineDatabaseOptions = {
  databaseName?: string;
  indexedDb?: IDBFactory | null;
};

export function openOfflineDatabase(options: OfflineDatabaseOptions = {}): Promise<IDBDatabase> {
  const indexedDb = options.indexedDb === undefined ? globalThis.indexedDB : options.indexedDb;
  if (!indexedDb) {
    return Promise.reject(new Error("IndexedDB is unavailable."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDb.open(
      options.databaseName ?? OFFLINE_DATABASE_NAME,
      OFFLINE_DATABASE_VERSION,
    );
    let settled = false;

    request.onupgradeneeded = () => {
      const database = request.result;
      createNamespaceStore(database, OFFLINE_STORE_NAMES.projections, ["namespaceKey", "projectionKey"]);
      createNamespaceStore(database, OFFLINE_STORE_NAMES.epubAssets, ["namespaceKey", "bookId"]);
      createNamespaceStore(database, OFFLINE_STORE_NAMES.readerState, ["namespaceKey", "bookId"]);
      createNamespaceStore(database, OFFLINE_STORE_NAMES.readerOutbox, ["namespaceKey", "resourceKey"]);
    };
    request.onerror = () => {
      settled = true;
      reject(request.error ?? new Error("IndexedDB open failed."));
    };
    request.onblocked = () => {
      settled = true;
      reject(new Error("IndexedDB open was blocked by another connection."));
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

export function transactionCompletion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

export async function runTransaction<T>(
  transaction: IDBTransaction,
  operation: () => Promise<T>,
): Promise<T> {
  const completion = transactionCompletion(transaction);
  try {
    const result = await operation();
    await completion;
    return result;
  } catch (error) {
    await completion.catch(() => undefined);
    throw error;
  }
}

export async function deleteNamespaceRecords(
  database: IDBDatabase,
  storeName: string,
  namespaceKey: string,
): Promise<void> {
  const transaction = database.transaction(storeName, "readwrite");
  const cursorRequest = transaction.objectStore(storeName).index(NAMESPACE_INDEX).openCursor(namespaceKey);

  await runTransaction(transaction, () => new Promise<void>((resolve, reject) => {
    cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error("IndexedDB cursor failed."));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        resolve();
        return;
      }
      cursor.delete();
      cursor.continue();
    };
  }),
  );
}

function createNamespaceStore(
  database: IDBDatabase,
  name: string,
  keyPath: string[],
): void {
  if (database.objectStoreNames.contains(name)) return;
  const store = database.createObjectStore(name, { keyPath });
  store.createIndex(NAMESPACE_INDEX, NAMESPACE_INDEX, { unique: false });
}
