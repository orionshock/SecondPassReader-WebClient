import type { BookDetail } from "@secondpass/client";
import { describe, expect, it, vi } from "vitest";
import { buildOfflineCacheNamespace } from "../../../../app/offline/namespace/OfflineCacheNamespace.Policy";
import {
  loadOfflineReaderBookMetadata,
  openOfflineBookForReader,
  retainOfflineReaderBookMetadata,
} from "../../../../app/offline/reader/continuity/OfflineReaderOpen.Actions";
import {
  cleanupOfflineNamespacePublication,
  createOfflineNamespacePublicationLease,
} from "../../../../app/offline/namespace/OfflineNamespacePublication.Lifecycle";
import type {
  OfflineProjectionRepository,
  OfflineProjectionRecord,
  OfflinePublicationAssetCompleteRecord,
  OfflinePublicationAssetRepository,
} from "../../../../app/offline/storage/OfflineRepositories.Types";
import { releaseOpenedBook } from "../../../../features/reader/ReaderOpen.Lifecycle";
import { createInMemoryOfflineRepositoryFactories } from "../../storage/OfflineRepositoryTest.Fixtures";

const CHECKSUM = "a".repeat(64);
const OTHER_CHECKSUM = "b".repeat(64);
const namespace = buildOfflineCacheNamespace({
  serverId: "123e4567-e89b-42d3-a456-426614174000",
  profileId: "reader-1",
})!;

describe("offline Reader admission", () => {
  it("opens a verified EPUB Blob with local continuity and no server authority", async () => {
    const repositories = await repositoriesWithAsset(asset(CHECKSUM));
    const createObjectUrl = vi.fn(() => "blob:offline-book");

    const result = await openOfflineBookForReader({
      namespace,
      book: book(CHECKSUM),
      assetRepository: repositories.assetRepository,
      readerStateRepository: repositories.readerStateRepository,
      outboxRepository: repositories.outboxRepository,
      createObjectUrl,
    });

    expect(result.status).toBe("opened");
    if (result.status !== "opened") return;
    expect(result.openedBook.source).toBe("offline");
    expect(result.openedBook.bootstrap.kind).toBe("local");
    expect(result.openedBook.bootstrap.kind === "local" && result.openedBook.bootstrap.serverWritesAllowed).toBe(false);
    expect(result.openedBook.bootstrap.kind === "local" && result.openedBook.bootstrap.continuity.session.serverSessionId).toBeNull();
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(await repositories.outboxRepository.list(namespace.key)).toEqual([
      { type: "establish-session", namespaceKey: namespace.key, bookId: "book-1" },
    ]);
  });

  it("reuses the same provisional continuity identity across offline opens", async () => {
    const repositories = await repositoriesWithAsset(asset(CHECKSUM));
    const first = await open(repositories, book(CHECKSUM));
    const second = await open(repositories, book(CHECKSUM));

    expect(first.status).toBe("opened");
    expect(second.status).toBe("opened");
    if (first.status !== "opened" || second.status !== "opened") return;
    const firstBootstrap = first.openedBook.bootstrap;
    const secondBootstrap = second.openedBook.bootstrap;
    expect(firstBootstrap.kind).toBe("local");
    expect(secondBootstrap.kind).toBe("local");
    if (firstBootstrap.kind !== "local" || secondBootstrap.kind !== "local") return;
    expect(secondBootstrap.continuity.session.localSessionId)
      .toBe(firstBootstrap.continuity.session.localSessionId);
  });

  it("restores the latest durable local progress without a server bootstrap", async () => {
    const repositories = await repositoriesWithAsset(asset(CHECKSUM));
    await repositories.readerStateRepository.putBookState({
      annotationRevision: 0,
      namespaceKey: namespace.key,
      bookId: "book-1",
      schemaVersion: 1,
      session: {
        kind: "provisional",
        localSessionId: "local:existing",
        serverSessionId: null,
        lastKnownServerStatus: null,
      },
      progress: {
        location: "epubcfi(/6/18)",
        percentage: 75,
        locationLabel: "075% - Latest local position",
      },
      annotations: [],
    });

    const result = await open(repositories, book(CHECKSUM));

    expect(result.status).toBe("opened");
    if (result.status !== "opened") return;
    expect(result.openedBook.bootstrap.continuity.progress).toEqual({
      location: "epubcfi(/6/18)",
      percentage: 75,
      locationLabel: "075% - Latest local position",
    });
  });

  it.each([
    [null, book(CHECKSUM), "missing-asset"],
    [asset(OTHER_CHECKSUM), book(CHECKSUM), "invalid-asset"],
    [asset(CHECKSUM), book(CHECKSUM, "cbz"), "unsupported-format"],
  ] as const)("refuses unavailable publication assets", async (storedAsset, value, reason) => {
    const repositories = await repositoriesWithAsset(storedAsset);
    const createObjectUrl = vi.fn(() => "blob:must-not-open");

    const result = await openOfflineBookForReader({
      namespace,
      book: value,
      assetRepository: repositories.assetRepository,
      readerStateRepository: repositories.readerStateRepository,
      outboxRepository: repositories.outboxRepository,
      createObjectUrl,
    });

    expect(result).toEqual({ status: "unavailable", reason });
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it("normalizes repository failures without retaining raw error data", async () => {
    const repositories = await repositoriesWithAsset(asset(CHECKSUM));
    vi.mocked(repositories.assetRepository.get).mockRejectedValueOnce(
      new Error("https://library.example/private.epub?token=secret"),
    );

    const result = await open(repositories, book(CHECKSUM));

    expect(result).toEqual({ status: "failed" });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("retains and reloads the Book metadata needed after a page reload", async () => {
    const factories = createInMemoryOfflineRepositoryFactories();
    const repository = await factories.createProjectionRepository();
    const value = book(CHECKSUM);

    await retainOfflineReaderBookMetadata({
      book: value,
      repository,
      publication: createOfflineNamespacePublicationLease(namespace.key, () => true)!,
      clock: { now: () => 123 },
    });

    expect(await loadOfflineReaderBookMetadata({
      namespaceKey: namespace.key,
      bookId: "book-1",
      repository,
    })).toEqual(value);
    expect(await loadOfflineReaderBookMetadata({
      namespaceKey: namespace.key,
      bookId: "other-book",
      repository,
    })).toBeNull();
  });

  it("does not recreate retained metadata when namespace cleanup starts during publication", async () => {
    const namespaceKey = "projection-cleanup-race";
    const putStarted = deferred<void>();
    const releasePut = deferred<void>();
    let projection: OfflineProjectionRecord<BookDetail> | null = null;
    const repository = {
      get: vi.fn(async () => projection),
      put: vi.fn(async (record: OfflineProjectionRecord<BookDetail>) => {
        putStarted.resolve();
        await releasePut.promise;
        projection = record;
      }),
      delete: vi.fn(async () => { projection = null; }),
      deleteNamespace: vi.fn(async () => { projection = null; }),
    } as unknown as OfflineProjectionRepository;
    const publication = createOfflineNamespacePublicationLease(namespaceKey, () => true)!;
    const write = retainOfflineReaderBookMetadata({ book: book(CHECKSUM), repository, publication });
    await putStarted.promise;
    const cleanup = cleanupOfflineNamespacePublication(namespaceKey, () => repository.deleteNamespace(namespaceKey));

    releasePut.resolve();
    await Promise.all([write, cleanup]);

    expect(projection).toBeNull();
  });

  it("does not let an older retained metadata publication overwrite a newer refresh", async () => {
    const namespaceKey = "projection-refresh-race";
    const oldPutStarted = deferred<void>();
    const releaseOldPut = deferred<void>();
    let projection: OfflineProjectionRecord<BookDetail> | null = null;
    let putCount = 0;
    const repository = {
      get: vi.fn(async () => projection),
      put: vi.fn(async (record: OfflineProjectionRecord<BookDetail>) => {
        putCount += 1;
        if (putCount === 1) {
          oldPutStarted.resolve();
          await releaseOldPut.promise;
        }
        projection = record;
      }),
      delete: vi.fn(async () => { projection = null; }),
      deleteNamespace: vi.fn(async () => { projection = null; }),
    } as unknown as OfflineProjectionRepository;
    let revision = 1;
    const oldPublication = createOfflineNamespacePublicationLease(namespaceKey, () => revision === 1)!;
    const oldWrite = retainOfflineReaderBookMetadata({
      book: { ...book(CHECKSUM), title: "Old title" },
      repository,
      publication: oldPublication,
    });
    await oldPutStarted.promise;
    revision = 2;
    const newWrite = retainOfflineReaderBookMetadata({
      book: { ...book(CHECKSUM), title: "New title" },
      repository,
      publication: createOfflineNamespacePublicationLease(namespaceKey, () => revision === 2)!,
    });

    releaseOldPut.resolve();
    await Promise.all([oldWrite, newWrite]);

    const committed = await repository.get<BookDetail>(namespaceKey, "reader-book:book-1");
    expect(committed?.value).toMatchObject({ title: "New title" });
  });

  it("uses the existing Reader lifecycle to revoke an offline object URL", async () => {
    const repositories = await repositoriesWithAsset(asset(CHECKSUM));
    const result = await open(repositories, book(CHECKSUM));
    expect(result.status).toBe("opened");
    if (result.status !== "opened") return;
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    releaseOpenedBook(result.openedBook);

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:offline-book");
    revokeObjectURL.mockRestore();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function repositoriesWithAsset(storedAsset: OfflinePublicationAssetCompleteRecord<Blob> | null) {
  const factories = createInMemoryOfflineRepositoryFactories();
  let currentAsset = storedAsset;
  const assetRepository: OfflinePublicationAssetRepository<Blob> = {
    get: vi.fn(async () => currentAsset),
    list: vi.fn(async () => currentAsset ? [currentAsset] : []),
    putComplete: vi.fn(async (record) => { currentAsset = record; }),
    delete: vi.fn(async () => { currentAsset = null; }),
    deleteNamespace: vi.fn(async () => { currentAsset = null; }),
  };
  return {
    assetRepository,
    readerStateRepository: await factories.createReaderStateRepository(),
    outboxRepository: await factories.createReaderOutboxRepository(),
  };
}

function open(
  repositories: Awaited<ReturnType<typeof repositoriesWithAsset>>,
  value: BookDetail,
) {
  return openOfflineBookForReader({
    namespace,
    book: value,
    assetRepository: repositories.assetRepository,
    readerStateRepository: repositories.readerStateRepository,
    outboxRepository: repositories.outboxRepository,
    createObjectUrl: () => "blob:offline-book",
  });
}

function book(checksum: string, format = "epub"): BookDetail {
  return {
    id: "book-1",
    title: "Offline Book",
    subtitle: "",
    description: "",
    authors: [],
    catalogTags: [],
    groups: [],
    file: { format, fileSize: 4, checksum, downloadUrl: "https://library.example/private" },
  } as unknown as BookDetail;
}

function asset(checksum: string): OfflinePublicationAssetCompleteRecord<Blob> {
  const payload = new Blob(["book"]);
  return {
    status: "complete",
    namespaceKey: namespace.key,
    bookId: "book-1",
    format: "epub",
    checksum,
    byteLength: payload.size,
    schemaVersion: 1,
    payload,
  };
}
