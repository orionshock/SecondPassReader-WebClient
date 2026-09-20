import { IDBCursor, IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openIndexedDbOfflineRepositories } from "../../../app/offline/storage/IndexedDbOfflineRepositories.Factory";
import type { IndexedDbOfflineRepositories } from "../../../app/offline/storage/IndexedDbOfflineRepositories.Factory";
import type { OfflineReaderBookState } from "../../../app/offline/storage/OfflineRepositories.Types";
import type { ReplaceReaderProgressIntent } from "../../../app/offline/reader/outbox/ReaderOutbox.Policy";
import { buildOfflineCacheNamespace } from "../../../app/offline/namespace/OfflineCacheNamespace.Policy";
import {
  cleanupOfflineNamespacePublication,
  createOfflineNamespacePublicationLease,
  publishOfflineNamespaceMutation,
} from "../../../app/offline/namespace/OfflineNamespacePublication.Lifecycle";

const SERVER_A = "123e4567-e89b-42d3-a456-426614174000";
const SERVER_B = "123e4567-e89b-42d3-a456-426614174001";

describe("atomic offline namespace cleanup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads all five stores under a stable identity key and isolates a replacement Library", async () => {
    const repositories = await createRepositories("namespace-server-identity");
    const original = buildOfflineCacheNamespace({ serverId: SERVER_A, profileId: "reader-1" })!.key;
    const alternateRoute = buildOfflineCacheNamespace({ serverId: SERVER_A, profileId: "reader-1" })!.key;
    const replacement = buildOfflineCacheNamespace({ serverId: SERVER_B, profileId: "reader-1" })!.key;
    await populateNamespace(repositories, original, "book-1");

    expect(alternateRoute).toBe(original);
    await expectNamespacePresent(repositories, alternateRoute, "book-1");
    await expectNamespaceMissing(repositories, replacement, "book-1");
    await repositories.deleteNamespace(original);
    await expectNamespaceMissing(repositories, original, "book-1");
    repositories.close();
  });

  it("orders in-flight asset publication before cleanup and prevents recreation", async () => {
    const repositories = await createRepositories("namespace-asset-publication-cleanup");
    const namespaceKey = buildOfflineCacheNamespace({ serverId: SERVER_A, profileId: "reader-1" })!.key;
    let releaseWrite!: () => void;
    let signalWritten!: () => void;
    const writeGate = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const written = new Promise<void>((resolve) => { signalWritten = resolve; });
    const lease = createOfflineNamespacePublicationLease(namespaceKey, () => true)!;
    const publishing = publishOfflineNamespaceMutation(lease, async () => {
      await repositories.publicationAssets.putComplete({
        status: "complete", namespaceKey, bookId: "book-1", format: "epub",
        checksum: "a".repeat(64), byteLength: 1, schemaVersion: 1, payload: new Uint8Array([1]),
      });
      signalWritten();
      await writeGate;
      return () => repositories.publicationAssets.delete(namespaceKey, "book-1", "epub");
    });
    await written;
    const cleanup = cleanupOfflineNamespacePublication(namespaceKey, () => repositories.deleteNamespace(namespaceKey));
    releaseWrite();

    await expect(publishing).resolves.toBe(false);
    await expect(cleanup).resolves.toBeUndefined();
    await expect(repositories.publicationAssets.get(namespaceKey, "book-1", "epub")).resolves.toBeNull();
    repositories.close();
  });

  it("removes every namespace-owned store while retaining another namespace", async () => {
    const repositories = await createRepositories("namespace-complete-delete");
    await populateNamespace(repositories, "account-a", "book-a");
    await populateNamespace(repositories, "account-b", "book-b");

    await expect(repositories.deleteNamespace("account-a")).resolves.toBeUndefined();

    await expectNamespaceMissing(repositories, "account-a", "book-a");
    await expectNamespacePresent(repositories, "account-b", "book-b");
    repositories.close();
  });

  it("aborts every store deletion when a queued cursor delete fails", async () => {
    const repositories = await createRepositories("namespace-atomic-rollback");
    await populateNamespace(repositories, "account-a", "book-a");
    const originalDelete = IDBCursor.prototype.delete;
    let deleteCalls = 0;
    vi.spyOn(IDBCursor.prototype, "delete").mockImplementation(function (this: IDBCursor) {
      deleteCalls += 1;
      if (deleteCalls === 3) throw new Error("injected namespace delete failure");
      return originalDelete.call(this);
    });

    await expect(repositories.deleteNamespace("account-a")).rejects.toBeDefined();

    expect(deleteCalls).toBe(3);
    await expectNamespacePresent(repositories, "account-a", "book-a");
    repositories.close();
  });

  it("can retry after an aborted delete and after a committed result was not observed", async () => {
    const repositories = await createRepositories("namespace-idempotent-retry");
    await populateNamespace(repositories, "account-a", "book-a");
    const originalDelete = IDBCursor.prototype.delete;
    let fail = true;
    vi.spyOn(IDBCursor.prototype, "delete").mockImplementation(function (this: IDBCursor) {
      if (fail) {
        fail = false;
        throw new Error("transient delete failure");
      }
      return originalDelete.call(this);
    });

    await expect(repositories.deleteNamespace("account-a")).rejects.toBeDefined();
    vi.restoreAllMocks();
    await expect(repositories.deleteNamespace("account-a")).resolves.toBeUndefined();
    await expectNamespaceMissing(repositories, "account-a", "book-a");

    // A caller can safely retry if commit succeeded but its completion was not observed.
    await expect(repositories.deleteNamespace("account-a")).resolves.toBeUndefined();
    await expect(repositories.deleteNamespace("account-empty")).resolves.toBeUndefined();
    repositories.close();
  });
});

async function createRepositories(databaseName: string) {
  return openIndexedDbOfflineRepositories<Uint8Array>({
    indexedDb: new IDBFactory(),
    databaseName,
  });
}

async function populateNamespace(
  repositories: IndexedDbOfflineRepositories<Uint8Array>,
  namespaceKey: string,
  bookId: string,
): Promise<void> {
  await repositories.projections.put({
    namespaceKey,
    projectionKey: `book:${bookId}`,
    value: { id: bookId },
    fetchedAt: 1,
    schemaVersion: 1,
  });
  await repositories.publicationAssets.putComplete({
    status: "complete",
    namespaceKey,
    bookId,
    format: "epub",
    checksum: "a".repeat(64),
    byteLength: 1,
    schemaVersion: 1,
    payload: new Uint8Array([1]),
  });
  await repositories.publicationCovers.put({
    namespaceKey,
    bookId,
    sourceUrl: `https://library.example/${bookId}.jpg`,
    contentType: "image/jpeg",
    byteLength: 1,
    schemaVersion: 1,
    payload: new Uint8Array([2]),
  });
  await repositories.readerState.putBookState(readerState(namespaceKey, bookId));
  await repositories.readerOutbox.upsertIntent(progressIntent(namespaceKey, bookId));
}

async function expectNamespacePresent(
  repositories: IndexedDbOfflineRepositories<Uint8Array>,
  namespaceKey: string,
  bookId: string,
): Promise<void> {
  await expect(repositories.projections.get(namespaceKey, `book:${bookId}`)).resolves.not.toBeNull();
  await expect(repositories.publicationAssets.get(namespaceKey, bookId, "epub")).resolves.not.toBeNull();
  await expect(repositories.publicationCovers.get(namespaceKey, bookId)).resolves.not.toBeNull();
  await expect(repositories.readerState.getBookState(namespaceKey, bookId)).resolves.not.toBeNull();
  await expect(repositories.readerOutbox.list(namespaceKey)).resolves.toHaveLength(1);
}

async function expectNamespaceMissing(
  repositories: IndexedDbOfflineRepositories<Uint8Array>,
  namespaceKey: string,
  bookId: string,
): Promise<void> {
  await expect(repositories.projections.get(namespaceKey, `book:${bookId}`)).resolves.toBeNull();
  await expect(repositories.publicationAssets.get(namespaceKey, bookId, "epub")).resolves.toBeNull();
  await expect(repositories.publicationCovers.get(namespaceKey, bookId)).resolves.toBeNull();
  await expect(repositories.readerState.getBookState(namespaceKey, bookId)).resolves.toBeNull();
  await expect(repositories.readerOutbox.list(namespaceKey)).resolves.toEqual([]);
}

function readerState(namespaceKey: string, bookId: string): OfflineReaderBookState {
  return {
    namespaceKey,
    bookId,
    schemaVersion: 1,
    session: {
      kind: "server-confirmed",
      localSessionId: `local:${bookId}`,
      serverSessionId: `session:${bookId}`,
      lastKnownServerStatus: "active",
    },
    progress: { cfi: "epubcfi(/6/2)", percentage: 10, locationLabel: "010%" },
    annotations: [],
    annotationRevision: 0,
  };
}

function progressIntent(namespaceKey: string, bookId: string): ReplaceReaderProgressIntent {
  return {
    type: "replace-progress",
    namespaceKey,
    bookId,
    serverSessionId: `session:${bookId}`,
    intentRevision: 1,
    progress: { cfi: "epubcfi(/6/2)", percentage: 10, locationLabel: "010%" },
  };
}
