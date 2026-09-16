import { describe, expect, it, vi } from "vitest";
import {
  cacheOfflineHomeRecent,
  cacheOfflineHomeShelves,
} from "../../../features/home/offline/OfflineHomeCache.Actions";
import type { IndexedDbOfflineRepositories } from "../../../app/offline/storage/IndexedDbOfflineRepositories.Factory";
import type { OfflineProjectionPublicationLease } from "../../../app/offline/namespace/OfflineProjectionPublication.Lifecycle";
import { createOfflineProjectionPublicationLease } from "../../../app/offline/namespace/OfflineProjectionPublication.Lifecycle";
import { removeOfflineNamespace } from "../../../app/offline/namespace/OfflineNamespaceCleanup.Actions";
import type { OfflineProjectionRecord } from "../../../app/offline/storage/OfflineRepositories.Types";
import { recentSessionFixture } from "../../sessions/SessionTest.Fixtures";

describe("offline Home cache writes", () => {
  it("stores normalized recent and shelf previews under stable section keys", async () => {
    const repositories = {
      projections: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
      },
      close: vi.fn(),
    } as unknown as IndexedDbOfflineRepositories<Blob>;
    const dependencies = {
      openRepositories: vi.fn(async () => repositories),
      clock: { now: () => 123 },
    };

    await cacheOfflineHomeRecent(
      { namespaceKey: "account-a", items: [recentSessionFixture()] },
      currentPublication("account-a"),
      dependencies,
    );
    await cacheOfflineHomeShelves({
      namespaceKey: "account-a",
      items: [{ id: "shelf-1", name: "Shelf", owner_type: "user" }],
    }, currentPublication("account-a"), dependencies);

    expect(repositories.projections.put).toHaveBeenNthCalledWith(1, {
      namespaceKey: "account-a",
      projectionKey: "home-recent",
      value: { items: [recentSessionFixture()] },
      fetchedAt: 123,
      schemaVersion: 1,
    });
    expect(repositories.projections.put).toHaveBeenNthCalledWith(2, expect.objectContaining({
      projectionKey: "home-shelves",
      value: { items: [{ id: "shelf-1", name: "Shelf", owner_type: "user" }] },
    }));
    expect(repositories.close).toHaveBeenCalledTimes(2);
  });

  it("does not open storage without a verified namespace key", async () => {
    const openRepositories = vi.fn();

    await cacheOfflineHomeRecent(
      { namespaceKey: " ", items: [] },
      currentPublication("account-a"),
      { openRepositories },
    );

    expect(openRepositories).not.toHaveBeenCalled();
  });

  it("does not recreate a projection when namespace cleanup starts during a cache write", async () => {
    const putStarted = deferred<void>();
    const releasePut = deferred<void>();
    let projection: OfflineProjectionRecord<unknown> | null = null;
    const projections = {
      get: vi.fn(async () => projection),
      put: vi.fn(async (record: OfflineProjectionRecord<unknown>) => {
        putStarted.resolve();
        await releasePut.promise;
        projection = record;
      }),
      delete: vi.fn(async () => { projection = null; }),
    };
    const cacheRepositories = {
      projections,
      close: vi.fn(),
    } as unknown as IndexedDbOfflineRepositories<Blob>;
    const cache = cacheOfflineHomeRecent(
      { namespaceKey: "account-cleaned", items: [recentSessionFixture()] },
      ownedPublication("account-cleaned"),
      { openRepositories: async () => cacheRepositories },
    );
    await putStarted.promise;
    const cleanupRepositories = {
      deleteNamespace: vi.fn(async () => { projection = null; }),
      close: vi.fn(),
    } as unknown as IndexedDbOfflineRepositories<Blob>;

    const cleanup = removeOfflineNamespace("account-cleaned", async () => cleanupRepositories);
    await Promise.resolve();
    expect(cleanupRepositories.deleteNamespace).not.toHaveBeenCalled();
    releasePut.resolve();
    await Promise.all([cache, cleanup]);

    expect(projection).toBeNull();
    expect(projections.delete).toHaveBeenCalledWith("account-cleaned", "home-recent");
    expect(cleanupRepositories.deleteNamespace).toHaveBeenCalledWith("account-cleaned");
  });

  it("restores a good snapshot when the preview lifetime ends during publication", async () => {
    const previous: OfflineProjectionRecord<{ items: [] }> = {
      namespaceKey: "account-preserved",
      projectionKey: "home-recent",
      value: { items: [] },
      fetchedAt: 1,
      schemaVersion: 1,
    };
    let projection: OfflineProjectionRecord<unknown> | null = previous;
    let ownsPreview = true;
    const putStarted = deferred<void>();
    const releasePut = deferred<void>();
    let putCount = 0;
    const repositories = {
      projections: {
        get: vi.fn(async () => projection),
        put: vi.fn(async (record: OfflineProjectionRecord<unknown>) => {
          putCount += 1;
          if (putCount === 1) {
            putStarted.resolve();
            await releasePut.promise;
          }
          projection = record;
        }),
        delete: vi.fn(async () => { projection = null; }),
      },
      close: vi.fn(),
    } as unknown as IndexedDbOfflineRepositories<Blob>;
    const publication = createOfflineProjectionPublicationLease("account-preserved", () => ownsPreview)!;
    const cache = cacheOfflineHomeRecent(
      { namespaceKey: "account-preserved", items: [recentSessionFixture()] },
      publication,
      { openRepositories: async () => repositories },
    );
    await putStarted.promise;

    ownsPreview = false;
    releasePut.resolve();
    await cache;

    expect(projection).toEqual(previous);
    expect(repositories.projections.put).toHaveBeenLastCalledWith(previous);
  });
});

function currentPublication(namespaceKey: string): OfflineProjectionPublicationLease {
  return { namespaceKey, isCurrent: () => true };
}

function ownedPublication(namespaceKey: string): OfflineProjectionPublicationLease {
  return createOfflineProjectionPublicationLease(namespaceKey, () => true)!;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
