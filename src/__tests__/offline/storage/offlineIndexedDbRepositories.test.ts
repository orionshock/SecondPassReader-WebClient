import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import type { OfflineReaderBookState } from "../../../app/offline/storage/OfflineRepositories.Types";
import { openIndexedDbOfflineRepositories } from "../../../app/offline/storage/IndexedDbOfflineRepositories.Factory";
import type { ReplaceReaderProgressIntent } from "../../../app/offline/reader/outbox/ReaderOutbox.Policy";
import { subscribeToOfflinePublicationAssetChange } from "../../../app/offline/publication/OfflinePublicationAssetChange.State";
import type { LocalReaderAnnotationCommit } from "../../../app/offline/reader/annotations/LocalReaderAnnotationCommit.Repository";

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
    const coverPayload = new Blob([new Uint8Array([4, 5])], { type: "image/jpeg" });
    await first.publicationCovers.put({
      namespaceKey: "account-a",
      bookId: "book-1",
      sourceUrl: "https://library.example/covers/book-1.jpg",
      contentType: "image/jpeg",
      byteLength: coverPayload.size,
      schemaVersion: 1,
      payload: coverPayload,
    });
    await first.readerState.putBookState(readerState());
    first.close();

    const reopened = await openIndexedDbOfflineRepositories(options);
    const asset = await reopened.publicationAssets.get("account-a", "book-1", "epub");
    const cover = await reopened.publicationCovers.get("account-a", "book-1");

    expect(new Uint8Array(await asset!.payload.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(new Uint8Array(await cover!.payload.arrayBuffer())).toEqual(new Uint8Array([4, 5]));
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
    const coverPayload = new Uint8Array([2]);
    await repositories.publicationCovers.put({
      namespaceKey: "account-a",
      bookId: "book-1",
      sourceUrl: "https://library.example/cover.jpg",
      contentType: "image/jpeg",
      byteLength: coverPayload.byteLength,
      schemaVersion: 1,
      payload: coverPayload,
    });
    await repositories.publicationCovers.delete("account-a", "book-1");

    expect(listener).toHaveBeenNthCalledWith(1, "account-a");
    expect(listener).toHaveBeenNthCalledWith(2, "account-a");
    expect(listener).toHaveBeenNthCalledWith(3, "account-a");
    expect(listener).toHaveBeenNthCalledWith(4, "account-a");
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

  it("adds cover storage without changing current version 2 publication records", async () => {
    const indexedDb = new IDBFactory();
    const databaseName = "offline-version-2-cover-migration";
    await putVersionTwoAsset(indexedDb, databaseName);

    const repositories = await openIndexedDbOfflineRepositories<Uint8Array>({ indexedDb, databaseName });

    expect(await repositories.publicationAssets.get("account-a", "book-1", "epub")).toMatchObject({
      namespaceKey: "account-a",
      bookId: "book-1",
      checksum: "b".repeat(64),
    });
    expect(await repositories.publicationCovers.get("account-a", "book-1")).toBeNull();
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

  it("preserves an annotation committed after another connection captured stale Reader state", async () => {
    const { first, second } = await twoReaderConnections("reader-state-progress-annotation-race");
    const stale = await first.readerState.getBookState("account-a", "book-1");
    await second.readerState.updateBookState("account-a", "book-1", (current) => ({
      ...current,
      annotationRevision: 1,
      annotations: [bookmarkProjection("annotation-new")],
    }));

    expect(stale?.annotationRevision).toBe(0);
    await expect(first.readerState.updateBookState("account-a", "book-1", (current) => ({
      ...current,
      progress: { cfi: "epubcfi(/6/8)", percentage: 40, locationLabel: "040% - Location" },
    }))).resolves.toMatchObject({ status: "committed" });

    expect(await second.readerState.getBookState("account-a", "book-1")).toMatchObject({
      annotationRevision: 1,
      annotations: [bookmarkProjection("annotation-new")],
      progress: { cfi: "epubcfi(/6/8)" },
    });
    first.close();
    second.close();
  });

  it("preserves newer progress and annotations when another connection updates Session authority", async () => {
    const { first, second } = await twoReaderConnections("reader-state-session-sibling-race");
    const stale = await first.readerState.getBookState("account-a", "book-1");
    await second.readerState.updateBookState("account-a", "book-1", (current) => ({
      ...current,
      progress: { cfi: "epubcfi(/6/12)", percentage: 60, locationLabel: "060% - Location" },
      annotationRevision: 1,
      annotations: [bookmarkProjection("annotation-new")],
    }));

    expect(stale?.progress?.cfi).toBe("epubcfi(/6/2)");
    await first.readerState.updateBookState("account-a", "book-1", (current) => ({
      ...current,
      session: {
        kind: "server-confirmed",
        localSessionId: current.session.localSessionId,
        serverSessionId: "session-2",
        lastKnownServerStatus: "active",
      },
    }));

    expect(await second.readerState.getBookState("account-a", "book-1")).toMatchObject({
      session: { serverSessionId: "session-2" },
      progress: { cfi: "epubcfi(/6/12)" },
      annotationRevision: 1,
      annotations: [bookmarkProjection("annotation-new")],
    });
    first.close();
    second.close();
  });

  it("keeps newer progress when the specialized annotation transaction commits", async () => {
    const { first, second } = await twoReaderConnections("reader-state-annotation-progress-race");
    const stale = (await first.readerState.getBookState("account-a", "book-1"))!;
    await second.readerState.updateBookState("account-a", "book-1", (current) => ({
      ...current,
      progress: { cfi: "epubcfi(/6/14)", percentage: 70, locationLabel: "070% - Location" },
    }));

    const commit: LocalReaderAnnotationCommit = {
      kind: "author",
      namespaceKey: "account-a",
      bookId: "book-1",
      authority: stale.session,
      expectedRevision: stale.annotationRevision,
      expectedProjection: undefined,
      mutation: {
        action: "upsert",
        annotation: {
          clientId: "annotation-atomic",
          kind: "bookmark",
          location: { cfi: "epubcfi(/6/4)", locationLabel: "Bookmark" },
        },
      },
    };
    await expect(first.readerAnnotationCommit.commit(commit)).resolves.toMatchObject({ status: "committed" });

    expect(await second.readerState.getBookState("account-a", "book-1")).toMatchObject({
      progress: { cfi: "epubcfi(/6/14)" },
      annotationRevision: 1,
    });
    expect(await second.readerOutbox.list("account-a")).toHaveLength(1);
    first.close();
    second.close();
  });

  it("returns missing without recreating stale state after namespace cleanup", async () => {
    const { first, second } = await twoReaderConnections("reader-state-cleanup-race");
    const stale = await first.readerState.getBookState("account-a", "book-1");
    await second.deleteNamespace("account-a");

    expect(stale).not.toBeNull();
    await expect(first.readerState.updateBookState("account-a", "book-1", (current) => ({
      ...current,
      progress: { cfi: "epubcfi(/6/20)", percentage: 100, locationLabel: "100% - Location" },
    }))).resolves.toEqual({ status: "missing" });
    expect(await second.readerState.getBookState("account-a", "book-1")).toBeNull();
    first.close();
    second.close();
  });

  it("fails clearly when IndexedDB is unavailable", async () => {
    await expect(openIndexedDbOfflineRepositories({ indexedDb: null })).rejects.toThrow(
      "IndexedDB is unavailable.",
    );
  });
});

function readerState(): OfflineReaderBookState {
  return {
    annotationRevision: 0,
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

async function twoReaderConnections(databaseName: string) {
  const indexedDb = new IDBFactory();
  const options = { indexedDb, databaseName };
  const first = await openIndexedDbOfflineRepositories(options);
  const second = await openIndexedDbOfflineRepositories(options);
  await first.readerState.putBookState(readerState());
  return { first, second };
}

function bookmarkProjection(clientId: string): OfflineReaderBookState["annotations"][number] {
  return {
    status: "present",
    origin: { kind: "server-confirmed", serverSessionId: "session-1" },
    annotation: {
      clientId,
      kind: "bookmark",
      location: { cfi: "epubcfi(/6/4)", locationLabel: "Bookmark" },
    },
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

function putVersionTwoAsset(indexedDb: IDBFactory, databaseName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(databaseName, 2);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore("publicationAssets", {
        keyPath: ["namespaceKey", "bookId", "format"],
      });
      store.createIndex("namespaceKey", "namespaceKey", { unique: false });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("publicationAssets", "readwrite");
      transaction.objectStore("publicationAssets").put({
        status: "complete",
        namespaceKey: "account-a",
        bookId: "book-1",
        format: "epub",
        checksum: "b".repeat(64),
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
