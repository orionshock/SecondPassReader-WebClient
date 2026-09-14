import { describe, expect, it, vi } from "vitest";
import type { IndexedDbOfflineRepositories } from "../../../app/offline/storage/IndexedDbOfflineRepositories.Factory";
import {
  inspectOfflineNamespace,
  removeOfflineNamespace,
} from "../../../app/offline/namespace/OfflineNamespaceCleanup.Actions";
import {
  summarizeOfflineNamespaceRetention,
} from "../../../app/offline/namespace/OfflineNamespaceRetention.Presenter";
import type { ReaderOutboxIntent } from "../../../app/offline/reader/outbox/ReaderOutbox.Policy";

describe("offline namespace retention", () => {
  it("summarizes pending authored work and retained publication bytes", () => {
    const summary = summarizeOfflineNamespaceRetention(
      [establish("book-a"), establish("book-a"), establish("book-b")],
      [asset("book-a", 10), asset("book-b", 25)],
    );

    expect(summary).toEqual({
      pendingBooks: 2,
      pendingIntents: 3,
      offlineAssetCount: 2,
      offlineAssetBytes: 35,
    });
  });

  it("inspects and closes one repository bundle", async () => {
    const repositories = repositoryBundle();
    repositories.readerOutbox.list = vi.fn(async () => [establish("book-a")]);
    repositories.publicationAssets.list = vi.fn(async () => [asset("book-a", 12)]);

    await expect(inspectOfflineNamespace("account-a", async () => repositories)).resolves.toMatchObject({
      pendingBooks: 1,
      offlineAssetBytes: 12,
    });
    expect(repositories.readerOutbox.list).toHaveBeenCalledWith("account-a");
    expect(repositories.publicationAssets.list).toHaveBeenCalledWith("account-a");
    expect(repositories.close).toHaveBeenCalledOnce();
  });

  it("delegates complete cleanup to the storage-owned atomic namespace delete", async () => {
    const repositories = repositoryBundle();

    await expect(removeOfflineNamespace("account-a", async () => repositories)).resolves.toEqual({ status: "removed" });
    expect(repositories.deleteNamespace).toHaveBeenCalledWith("account-a");
    expect(repositories.projections.deleteNamespace).not.toHaveBeenCalled();
    expect(repositories.publicationCovers.deleteNamespace).not.toHaveBeenCalled();
    expect(repositories.publicationAssets.deleteNamespace).not.toHaveBeenCalled();
    expect(repositories.readerState.deleteNamespace).not.toHaveBeenCalled();
    expect(repositories.readerOutbox.deleteNamespace).not.toHaveBeenCalled();
    expect(repositories.close).toHaveBeenCalledOnce();
  });

  it("normalizes cleanup failure and still closes storage", async () => {
    const repositories = repositoryBundle();
    repositories.deleteNamespace = vi.fn(async () => { throw new Error("raw IndexedDB failure"); });

    await expect(removeOfflineNamespace("account-a", async () => repositories)).resolves.toEqual({ status: "failed" });
    expect(repositories.close).toHaveBeenCalledOnce();
  });
});

function establish(bookId: string): ReaderOutboxIntent {
  return { type: "establish-session", namespaceKey: "account-a", bookId };
}

function asset(bookId: string, byteLength: number) {
  return {
    status: "complete" as const,
    namespaceKey: "account-a",
    bookId,
    format: "epub",
    checksum: "a".repeat(64),
    byteLength,
    schemaVersion: 1,
    payload: new Blob(["x"]),
  };
}

function repositoryBundle(): IndexedDbOfflineRepositories<Blob> {
  return {
    projections: {
      get: vi.fn(), put: vi.fn(), delete: vi.fn(), deleteNamespace: vi.fn(async () => undefined),
    },
    publicationAssets: {
      get: vi.fn(), list: vi.fn(async () => []), putComplete: vi.fn(), delete: vi.fn(), deleteNamespace: vi.fn(async () => undefined),
    },
    publicationCovers: {
      get: vi.fn(), put: vi.fn(), delete: vi.fn(), deleteNamespace: vi.fn(async () => undefined),
    },
    readerState: {
      getBookState: vi.fn(), putBookState: vi.fn(), deleteBookState: vi.fn(), deleteNamespace: vi.fn(async () => undefined),
    },
    readerOutbox: {
      list: vi.fn(async () => []), upsertIntent: vi.fn(), remove: vi.fn(), replace: vi.fn(), recordAttempt: vi.fn(), deleteNamespace: vi.fn(async () => undefined),
    },
    readerAnnotationCommit: { commit: vi.fn() },
    deleteNamespace: vi.fn(async () => undefined),
    close: vi.fn(),
  };
}
