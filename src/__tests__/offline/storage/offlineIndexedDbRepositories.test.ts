import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import type { OfflineReaderBookState } from "../../../app/offline/storage/OfflineRepositories.Types";
import { openIndexedDbOfflineRepositories } from "../../../app/offline/storage/IndexedDbOfflineRepositories.Factory";
import type { ReplaceReaderProgressIntent } from "../../../app/offline/reader/outbox/ReaderOutbox.Policy";
import { subscribeToOfflinePublicationAssetChange } from "../../../app/offline/publication/OfflinePublicationAssetChange.State";

describe("IndexedDB offline repository lifecycle", () => {
  it("creates every repository from an empty database", async () => {
    const repositories = await openIndexedDbOfflineRepositories<Uint8Array>({
      indexedDb: new IDBFactory(),
      databaseName: "offline-empty-schema",
    });

    await repositories.projections.put({
      namespaceKey: "account-a",
      projectionKey: "home",
      value: { ready: true },
      fetchedAt: 1_000,
      schemaVersion: 1,
    });
    await repositories.publicationAssets.putComplete({
      status: "complete",
      namespaceKey: "account-a",
      bookId: "book-1",
      format: "epub",
      checksum: "a".repeat(64),
      byteLength: 1,
      schemaVersion: 1,
      payload: new Uint8Array([1]),
    });
    await repositories.readerState.putBookState(readerState());
    await repositories.readerOutbox.upsertIntent(progressIntent(1, "epubcfi(/6/2)"));

    expect(await repositories.projections.get("account-a", "home")).not.toBeNull();
    expect(await repositories.publicationAssets.get("account-a", "book-1", "epub")).not.toBeNull();
    expect(await repositories.readerState.getBookState("account-a", "book-1")).not.toBeNull();
    expect(await repositories.readerOutbox.list("account-a")).toHaveLength(1);
    repositories.close();
  });

  it("preserves records and Blob payloads across close and reopen", async () => {
    const indexedDb = new IDBFactory();
    const options = { indexedDb, databaseName: "offline-reopen" };
    const first = await openIndexedDbOfflineRepositories(options);
    const payload = new Blob([new Uint8Array([1, 2, 3])], { type: "application/epub+zip" });

    await first.publicationAssets.putComplete({
      status: "complete",
      namespaceKey: "account-a",
      bookId: "book-1",
      format: "epub",
      checksum: "a".repeat(64),
      byteLength: payload.size,
      schemaVersion: 1,
      payload,
    });
    await first.readerState.putBookState(readerState());
    first.close();

    const reopened = await openIndexedDbOfflineRepositories(options);
    const asset = await reopened.publicationAssets.get("account-a", "book-1", "epub");

    expect(new Uint8Array(await asset!.payload.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(await reopened.readerState.getBookState("account-a", "book-1")).toEqual(readerState());
    reopened.close();
  });

  it("publishes committed publication asset changes for local views", async () => {
    const repositories = await openIndexedDbOfflineRepositories<Uint8Array>({
      indexedDb: new IDBFactory(),
      databaseName: "offline-asset-change-publication",
    });
    const listener = vi.fn();
    const unsubscribe = subscribeToOfflinePublicationAssetChange(listener);

    await repositories.publicationAssets.putComplete({
      status: "complete",
      namespaceKey: "account-a",
      bookId: "book-1",
      format: "epub",
      checksum: "a".repeat(64),
      byteLength: 1,
      schemaVersion: 1,
      payload: new Uint8Array([1]),
    });
    await repositories.publicationAssets.delete("account-a", "book-1", "epub");

    expect(listener).toHaveBeenNthCalledWith(1, "account-a");
    expect(listener).toHaveBeenNthCalledWith(2, "account-a");
    unsubscribe();
    repositories.close();
  });

  it("migrates version 1 EPUB records into format-aware publication assets", async () => {
    const indexedDb = new IDBFactory();
    const databaseName = "offline-version-1-migration";
    await putVersionOneAsset(indexedDb, databaseName);

    const repositories = await openIndexedDbOfflineRepositories<Uint8Array>({ indexedDb, databaseName });
    const migrated = await repositories.publicationAssets.get("account-a", "book-1", "epub");

    expect(migrated).toEqual({
      status: "complete",
      namespaceKey: "account-a",
      bookId: "book-1",
      format: "epub",
      checksum: "a".repeat(64),
      byteLength: 1,
      schemaVersion: 1,
      payload: new Uint8Array([1]),
    });
    repositories.close();
  });

  it("serializes overlapping outbox coalescing for one resource", async () => {
    const repositories = await openIndexedDbOfflineRepositories({
      indexedDb: new IDBFactory(),
      databaseName: "offline-overlapping-outbox",
    });

    await Promise.all([
      repositories.readerOutbox.upsertIntent(progressIntent(1, "epubcfi(/6/2)")),
      repositories.readerOutbox.upsertIntent(progressIntent(2, "epubcfi(/6/4)")),
      repositories.readerOutbox.upsertIntent(progressIntent(3, "epubcfi(/6/6)")),
    ]);

    expect(await repositories.readerOutbox.list("account-a")).toEqual([
      progressIntent(3, "epubcfi(/6/6)"),
    ]);
    repositories.close();
  });

  it("fails clearly when IndexedDB is unavailable", async () => {
    await expect(openIndexedDbOfflineRepositories({ indexedDb: null })).rejects.toThrow(
      "IndexedDB is unavailable.",
    );
  });
});

function readerState(): OfflineReaderBookState {
  return {
    namespaceKey: "account-a",
    bookId: "book-1",
    schemaVersion: 1,
    session: {
      kind: "server-confirmed",
      localSessionId: "local-book-1",
      serverSessionId: "session-1",
      lastKnownServerStatus: "active",
    },
    progress: {
      cfi: "epubcfi(/6/2)",
      percentage: 10,
      locationLabel: "010% - Location",
    },
    annotations: [],
  };
}

function progressIntent(intentRevision: number, cfi: string): ReplaceReaderProgressIntent {
  return {
    type: "replace-progress",
    namespaceKey: "account-a",
    bookId: "book-1",
    serverSessionId: "session-1",
    intentRevision,
    progress: { cfi, percentage: 10, locationLabel: "010% - Location" },
  };
}

function putVersionOneAsset(indexedDb: IDBFactory, databaseName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("epubAssets", { keyPath: ["namespaceKey", "bookId"] });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("epubAssets", "readwrite");
      transaction.objectStore("epubAssets").put({
        status: "complete",
        namespaceKey: "account-a",
        bookId: "book-1",
        checksum: "a".repeat(64),
        byteLength: 1,
        schemaVersion: 1,
        payload: new Uint8Array([1]),
      });
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  });
}
