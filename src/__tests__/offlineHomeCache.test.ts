import { describe, expect, it, vi } from "vitest";
import {
  cacheOfflineHomeRecent,
  cacheOfflineHomeShelves,
} from "../features/home/offline/OfflineHomeCache.Actions";
import type { IndexedDbOfflineRepositories } from "../app/offline/OfflineRepositories.IndexedDb";
import { recentSessionFixture } from "./SessionTest.Fixtures";

describe("offline Home cache writes", () => {
  it("stores normalized recent and shelf previews under stable section keys", async () => {
    const repositories = {
      projections: { put: vi.fn(async () => undefined) },
      close: vi.fn(),
    } as unknown as IndexedDbOfflineRepositories<Blob>;
    const dependencies = {
      openRepositories: vi.fn(async () => repositories),
      clock: { now: () => 123 },
    };

    await cacheOfflineHomeRecent({ namespaceKey: "account-a", items: [recentSessionFixture()] }, dependencies);
    await cacheOfflineHomeShelves({
      namespaceKey: "account-a",
      items: [{ id: "shelf-1", name: "Shelf", owner_type: "user" }],
    }, dependencies);

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

    await cacheOfflineHomeRecent({ namespaceKey: " ", items: [] }, { openRepositories });

    expect(openRepositories).not.toHaveBeenCalled();
  });
});
