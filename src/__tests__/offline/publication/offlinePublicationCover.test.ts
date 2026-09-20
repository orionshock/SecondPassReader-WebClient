import type { BookDetail, SecondPassClient } from "@secondpass/client";
import { describe, expect, it, vi } from "vitest";
import type { OfflineCacheNamespace } from "../../../app/offline/namespace/OfflineCacheNamespace.Policy";
import { createOfflineNamespacePublicationLease } from "../../../app/offline/namespace/OfflineNamespacePublication.Lifecycle";
import { acquireOfflinePublicationCover } from "../../../app/offline/publication/OfflinePublicationCover.Actions";
import {
  removeAllOfflinePublicationAssets,
  removeOfflinePublicationAsset,
} from "../../../app/offline/publication/OfflinePublicationRemoval.Actions";
import type {
  OfflinePublicationAssetCompleteRecord,
  OfflinePublicationAssetRepository,
  OfflinePublicationCoverRecord,
  OfflinePublicationCoverRepository,
} from "../../../app/offline/storage/OfflineRepositories.Types";

const namespace: OfflineCacheNamespace = {
  key: "account-a",
  serverId: "123e4567-e89b-42d3-a456-426614174000",
  profileId: "reader-1",
};

describe("offline publication covers", () => {
  it("stores a supported cover only after an explicit acquisition call", async () => {
    const covers = coverStore();
    const downloadCover = vi.fn(async () => ({
      blob: new Blob(["cover"], { type: "image/jpeg" }),
      contentType: "image/jpeg",
    }));

    const result = await acquireOfflinePublicationCover({
      namespace,
      publication: createOfflineNamespacePublicationLease(namespace.key, () => true)!,
      libraryBaseUrl: "https://library.example",
      book: book("/media/covers/book-1.jpg"),
      spl: client(downloadCover),
      repository: covers.repository,
    });

    expect(result.status).toBe("stored");
    expect(downloadCover).toHaveBeenCalledWith("https://library.example/media/covers/book-1.jpg");
    expect(covers.current()).toMatchObject({
      namespaceKey: "account-a",
      bookId: "book-1",
      sourceUrl: "https://library.example/media/covers/book-1.jpg",
      contentType: "image/jpeg",
      byteLength: 5,
    });
  });

  it("uses the current route for relative covers and ignores an old-route completion", async () => {
    const covers = coverStore();
    let finish!: (value: { blob: Blob; contentType: string }) => void;
    const pendingDownload = new Promise<{ blob: Blob; contentType: string }>((resolve) => { finish = resolve; });
    const downloadCover = vi.fn(async () => pendingDownload);
    let current = true;
    const pending = acquireOfflinePublicationCover({
      namespace,
      publication: createOfflineNamespacePublicationLease(namespace.key, () => current)!,
      libraryBaseUrl: "https://first.example",
      book: book("/covers/book-1.jpg"),
      spl: client(downloadCover),
      repository: covers.repository,
    });
    await vi.waitFor(() => expect(downloadCover).toHaveBeenCalledWith("https://first.example/covers/book-1.jpg"));

    current = false;
    finish({ blob: new Blob(["cover"], { type: "image/jpeg" }), contentType: "image/jpeg" });
    await expect(pending).resolves.toEqual({ status: "superseded" });
    expect(covers.repository.put).not.toHaveBeenCalled();
    expect(covers.current()).toBeNull();
  });

  it("reuses the same source and refreshes a changed source", async () => {
    const covers = coverStore(cover("https://library.example/covers/old.jpg"));
    const downloadCover = vi.fn(async () => ({
      blob: new Blob(["new"], { type: "image/png" }),
      contentType: "image/png",
    }));

    const unchanged = await acquireOfflinePublicationCover({
      namespace,
      publication: createOfflineNamespacePublicationLease(namespace.key, () => true)!,
      libraryBaseUrl: "https://library.example",
      book: book("/covers/old.jpg"),
      spl: client(downloadCover),
      repository: covers.repository,
    });
    const changed = await acquireOfflinePublicationCover({
      namespace,
      publication: createOfflineNamespacePublicationLease(namespace.key, () => true)!,
      libraryBaseUrl: "https://library.example",
      book: book("/covers/new.png"),
      spl: client(downloadCover),
      repository: covers.repository,
    });

    expect(unchanged.status).toBe("already-available");
    expect(changed.status).toBe("stored");
    expect(downloadCover).toHaveBeenCalledTimes(1);
    expect(covers.current()?.sourceUrl).toBe("https://library.example/covers/new.png");
  });

  it("does not publish an empty or unsupported response or replace a valid old cover", async () => {
    const oldCover = cover("https://library.example/covers/old.jpg");
    const covers = coverStore(oldCover);
    const result = await acquireOfflinePublicationCover({
      namespace,
      publication: createOfflineNamespacePublicationLease(namespace.key, () => true)!,
      libraryBaseUrl: "https://library.example",
      book: book("/covers/new.svg"),
      spl: client(vi.fn(async () => ({
        blob: new Blob([], { type: "image/svg+xml" }),
        contentType: "image/svg+xml",
      }))),
      repository: covers.repository,
    });

    expect(result.status).toBe("failed");
    expect(covers.current()).toEqual(oldCover);
  });

  it("treats a cross-origin fetch failure as nonfatal and preserves the previous cover", async () => {
    const oldCover = cover("https://library.example/covers/old.jpg");
    const covers = coverStore(oldCover);

    const result = await acquireOfflinePublicationCover({
      namespace,
      publication: createOfflineNamespacePublicationLease(namespace.key, () => true)!,
      libraryBaseUrl: "https://library.example",
      book: book("https://cdn.example/covers/new.jpg"),
      spl: client(vi.fn(async () => { throw new TypeError("Failed to fetch"); })),
      repository: covers.repository,
    });

    expect(result.status).toBe("failed");
    expect(covers.current()).toEqual(oldCover);
  });

  it("removes the Book cover with its last publication format and removes all by namespace", async () => {
    const covers = coverStore(cover("https://library.example/covers/old.jpg"));
    const assets = assetStore([asset("epub"), asset("pdf")]);

    await removeOfflinePublicationAsset({
      namespaceKey: "account-a",
      bookId: "book-1",
      format: "epub",
      assetRepository: assets.repository,
      coverRepository: covers.repository,
    });
    expect(covers.current()).not.toBeNull();

    await removeOfflinePublicationAsset({
      namespaceKey: "account-a",
      bookId: "book-1",
      format: "pdf",
      assetRepository: assets.repository,
      coverRepository: covers.repository,
    });
    expect(covers.current()).toBeNull();

    await covers.repository.put(cover("https://library.example/covers/new.jpg"));
    await removeAllOfflinePublicationAssets({
      namespaceKey: "account-a",
      assetRepository: assets.repository,
      coverRepository: covers.repository,
    });
    expect(covers.current()).toBeNull();
  });
});

function book(coverUrl: string | null): BookDetail {
  return { id: "book-1", title: "Book", coverUrl } as BookDetail;
}

function client(downloadCover: ReturnType<typeof vi.fn>): SecondPassClient {
  return { library: { books: { downloadCover } } } as unknown as SecondPassClient;
}

function cover(sourceUrl: string): OfflinePublicationCoverRecord<Blob> {
  const payload = new Blob(["old"], { type: "image/jpeg" });
  return {
    namespaceKey: "account-a",
    bookId: "book-1",
    sourceUrl,
    contentType: "image/jpeg",
    byteLength: payload.size,
    schemaVersion: 1,
    payload,
  };
}

function coverStore(initial: OfflinePublicationCoverRecord<Blob> | null = null) {
  let current = initial;
  const repository: OfflinePublicationCoverRepository<Blob> = {
    get: vi.fn(async () => current),
    put: vi.fn(async (record) => { current = record; }),
    delete: vi.fn(async () => { current = null; }),
    deleteNamespace: vi.fn(async () => { current = null; }),
  };
  return { repository, current: () => current };
}

function asset(format: string): OfflinePublicationAssetCompleteRecord<Blob> {
  return {
    status: "complete",
    namespaceKey: "account-a",
    bookId: "book-1",
    format,
    checksum: "a".repeat(64),
    byteLength: 1,
    schemaVersion: 1,
    payload: new Blob(["x"]),
  };
}

function assetStore(initial: OfflinePublicationAssetCompleteRecord<Blob>[]) {
  let records = initial;
  const repository: OfflinePublicationAssetRepository<Blob> = {
    get: vi.fn(),
    list: vi.fn(async () => records),
    putComplete: vi.fn(),
    delete: vi.fn(async (namespaceKey, bookId, format) => {
      records = records.filter((record) => (
        record.namespaceKey !== namespaceKey || record.bookId !== bookId || record.format !== format
      ));
    }),
    deleteNamespace: vi.fn(async (namespaceKey) => {
      records = records.filter((record) => record.namespaceKey !== namespaceKey);
    }),
  };
  return { repository };
}
