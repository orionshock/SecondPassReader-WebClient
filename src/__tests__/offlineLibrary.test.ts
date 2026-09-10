import type { BookDetail } from "@secondpass/client";
import { describe, expect, it, vi } from "vitest";
import {
  createOfflineLibraryController,
  type OfflineLibraryDependencies,
} from "../features/library/offline/OfflineLibrary.Controller";
import {
  buildOfflineLibraryBooks,
  searchOfflineLibraryBooks,
} from "../features/library/offline/OfflineLibrary.State";
import type { IndexedDbOfflineRepositories } from "../app/offline/OfflineRepositories.IndexedDb";
import type { OfflinePublicationAssetCompleteRecord } from "../app/offline/OfflineRepositories.Types";

const CHECKSUM = "a".repeat(64);

describe("offline Library state", () => {
  it("uses verified local metadata, deterministic title order, and a manageable fallback", () => {
    const assets = [asset("account-a", "book-z"), asset("account-a", "book-a")];
    const books = buildOfflineLibraryBooks({
      assets,
      metadata: new Map([
        ["book-z", book("book-z", "Zebra")],
        ["book-a", null],
      ]),
    });

    expect(books.map((entry) => entry.title)).toEqual(["Book book-a", "Zebra"]);
    expect(books[0]).toMatchObject({ admission: "unavailable", titleAvailable: false });
    expect(books[1]).toMatchObject({ admission: "available", titleAvailable: true });
  });

  it("does not call unsupported or corrupt retained assets readable", () => {
    const wrongSize = asset("account-a", "bad-size", "epub", new Blob(["bad"]));
    wrongSize.byteLength = 99;
    const books = buildOfflineLibraryBooks({
      assets: [wrongSize, asset("account-a", "comic", "cbz")],
      metadata: new Map([
        ["bad-size", book("bad-size", "Bad size")],
        ["comic", book("comic", "Comic", "cbz")],
      ]),
    });

    expect(books.find((entry) => entry.bookId === "bad-size")?.admission).toBe("unavailable");
    expect(books.find((entry) => entry.bookId === "comic")?.admission).toBe("unsupported-format");
  });

  it("searches only titles with case and whitespace normalization", () => {
    const books = buildOfflineLibraryBooks({
      assets: [asset("account-a", "one"), asset("account-a", "two")],
      metadata: new Map([
        ["one", book("one", "A  Distant Sun")],
        ["two", book("two", "Winter")],
      ]),
    });

    expect(searchOfflineLibraryBooks(books, " distant   SUN ").map((entry) => entry.bookId)).toEqual(["one"]);
    expect(searchOfflineLibraryBooks(books, "")).toEqual(books);
  });
});

describe("offline Library controller", () => {
  it("loads only the verified namespace and refreshes after matching asset changes", async () => {
    const harness = createHarness();
    const stop = harness.controller.start();
    await harness.ready();

    expect(harness.repositories.publicationAssets.list).toHaveBeenCalledWith("account-a");
    expect(harness.controller.getSnapshot().books).toHaveLength(1);

    harness.assets.length = 0;
    harness.assetListener?.("account-b");
    await Promise.resolve();
    expect(harness.controller.getSnapshot().books).toHaveLength(1);

    harness.assetListener?.("account-a");
    await harness.ready(0);
    expect(harness.controller.getSnapshot().books).toEqual([]);

    stop();
    expect(harness.repositories.close).toHaveBeenCalledOnce();
  });

  it("does no repository work without a verified namespace", () => {
    const openRepositories = vi.fn();
    const controller = createOfflineLibraryController(null, { openRepositories });
    const stop = controller.start();

    expect(controller.getSnapshot().status).toBe("unavailable");
    expect(openRepositories).not.toHaveBeenCalled();
    stop();
  });

  it("normalizes repository failure without exposing storage details", async () => {
    const controller = createOfflineLibraryController("account-a", {
      openRepositories: vi.fn(async () => { throw new Error("private IndexedDB path"); }),
      subscribeAssetChanges: vi.fn(() => () => undefined),
      subscribeFocus: vi.fn(() => () => undefined),
    });
    controller.start();
    await waitFor(() => controller.getSnapshot().status === "error");

    expect(JSON.stringify(controller.getSnapshot())).not.toContain("private IndexedDB path");
  });
});

function createHarness() {
  const assets = [asset("account-a", "book-1")];
  let assetListener: ((namespaceKey: string) => void) | null = null;
  const repositories = {
    projections: {
      get: vi.fn(async (_namespaceKey: string, projectionKey: string) => ({
        namespaceKey: "account-a",
        projectionKey,
        value: book("book-1", "Local Book"),
        fetchedAt: 1,
        schemaVersion: 1,
      })),
    },
    publicationAssets: { list: vi.fn(async () => [...assets]) },
    close: vi.fn(),
  } as unknown as IndexedDbOfflineRepositories<Blob>;
  const dependencies: Partial<OfflineLibraryDependencies> = {
    openRepositories: vi.fn(async () => repositories),
    subscribeAssetChanges: vi.fn((listener) => {
      assetListener = listener;
      return () => { assetListener = null; };
    }),
    subscribeFocus: vi.fn(() => () => undefined),
  };
  const controller = createOfflineLibraryController("account-a", dependencies);
  return {
    assets,
    repositories,
    controller,
    get assetListener() { return assetListener; },
    ready: (bookCount = 1) => waitFor(() => (
      controller.getSnapshot().status === "ready" && controller.getSnapshot().books.length === bookCount
    )),
  };
}

function asset(
  namespaceKey: string,
  bookId: string,
  format = "epub",
  payload = new Blob(["book"]),
): OfflinePublicationAssetCompleteRecord<Blob> {
  return {
    status: "complete",
    namespaceKey,
    bookId,
    format,
    checksum: CHECKSUM,
    byteLength: payload.size,
    schemaVersion: 1,
    payload,
  };
}

function book(bookId: string, title: string, format = "epub"): BookDetail {
  return {
    id: bookId,
    title,
    authors: [],
    catalogTags: [],
    groups: [],
    file: { format, checksum: CHECKSUM, fileSize: 4, downloadUrl: "https://library.example/private" },
  } as unknown as BookDetail;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for offline Library state");
}
