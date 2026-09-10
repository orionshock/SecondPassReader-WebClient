import type { BookDetail } from "@secondpass/client";
import { describe, expect, it, vi } from "vitest";
import {
  createOfflineBookDetailController,
  type OfflineBookDetailDependencies,
} from "../../../features/library/bookDetail/offline/OfflineBookDetail.Controller";
import { presentOfflineBookDetail } from "../../../features/library/bookDetail/offline/OfflineBookDetail.Presenter";
import type { IndexedDbOfflineRepositories } from "../../../app/offline/storage/IndexedDbOfflineRepositories.Factory";
import type { OfflinePublicationAssetCompleteRecord } from "../../../app/offline/storage/OfflineRepositories.Types";

const CHECKSUM_A = "a".repeat(64);
const CHECKSUM_B = "b".repeat(64);

describe("offline Book Detail state", () => {
  it("presents retained descriptive metadata and admits a matching EPUB Blob", () => {
    const detail = presentOfflineBookDetail({
      bookId: "book-1",
      book: book(),
      assets: [asset()],
    });

    expect(detail).toMatchObject({
      title: "Cached Book",
      subtitle: "A subtitle",
      authors: "Author One",
      series: "Series One #2",
      description: "<p>Saved description</p>",
      format: "epub",
      assetBytes: 4,
      availability: "available",
      canOpenReader: true,
    });
  });

  it.each([
    [asset({ checksum: CHECKSUM_B }), "needs-attention"],
    [asset({ format: "cbz" }), "unsupported-format"],
  ] as const)("does not weaken Reader admission for a retained invalid format/version", (storedAsset, availability) => {
    expect(presentOfflineBookDetail({ bookId: "book-1", book: book(), assets: [storedAsset] })).toMatchObject({
      availability,
      canOpenReader: false,
    });
  });

  it("keeps an asset-only fallback manageable but not readable", () => {
    expect(presentOfflineBookDetail({
      bookId: "very-long-book-identifier",
      book: null,
      assets: [asset({ bookId: "very-long-book-identifier" })],
    })).toMatchObject({
      title: "Book very-lon...",
      titleAvailable: false,
      format: "epub",
      availability: "needs-attention",
      canOpenReader: false,
      asset: expect.objectContaining({ bookId: "very-long-book-identifier" }),
    });
  });

  it("does not offer acquisition when neither metadata nor an asset exists", () => {
    expect(presentOfflineBookDetail({ bookId: "book-2", book: null, assets: [] })).toMatchObject({
      availability: "not-available",
      canOpenReader: false,
      asset: null,
    });
  });
});

describe("offline Book Detail controller", () => {
  it("loads exact namespace data and removes only the selected publication asset", async () => {
    const harness = createHarness();
    const stop = harness.controller.start();
    await harness.ready("available");

    await harness.controller.removeAsset();

    expect(harness.repositories.publicationAssets.list).toHaveBeenCalledWith("account-a");
    expect(harness.repositories.publicationAssets.delete).toHaveBeenCalledWith("account-a", "book-1", "epub");
    expect(harness.repositories.readerState.deleteBookState).not.toHaveBeenCalled();
    expect(harness.repositories.readerState.deleteNamespace).not.toHaveBeenCalled();
    expect(harness.repositories.readerOutbox.remove).not.toHaveBeenCalled();
    expect(harness.repositories.projections.delete).not.toHaveBeenCalled();
    expect(harness.controller.getSnapshot().detail).toMatchObject({
      title: "Cached Book",
      availability: "not-available",
    });
    stop();
    expect(harness.repositories.close).toHaveBeenCalledOnce();
  });

  it("refreshes only for matching namespace asset changes", async () => {
    const harness = createHarness();
    harness.controller.start();
    await harness.ready("available");
    const reads = vi.mocked(harness.repositories.publicationAssets.list).mock.calls.length;

    harness.assetListener?.("account-b");
    await Promise.resolve();
    expect(harness.repositories.publicationAssets.list).toHaveBeenCalledTimes(reads);

    harness.assetListener?.("account-a");
    await waitFor(() => vi.mocked(harness.repositories.publicationAssets.list).mock.calls.length > reads);
  });

  it("keeps asset-only fallback after projection failure and normalizes total storage failure", async () => {
    const partial = createHarness({ projectionFailure: true });
    partial.controller.start();
    await partial.ready("needs-attention");
    expect(partial.controller.getSnapshot().detail?.title).toBe("Book book-1");

    const failed = createHarness({ projectionFailure: true, assetFailure: true });
    failed.controller.start();
    await waitFor(() => failed.controller.getSnapshot().status === "error");
    expect(JSON.stringify(failed.controller.getSnapshot())).not.toContain("private database path");
  });

  it("does no repository work without a verified namespace", () => {
    const openRepositories = vi.fn();
    const controller = createOfflineBookDetailController(
      { namespaceKey: null, bookId: "book-1" },
      { openRepositories },
    );
    controller.start();

    expect(controller.getSnapshot().status).toBe("unavailable");
    expect(openRepositories).not.toHaveBeenCalled();
  });
});

function createHarness(options: { projectionFailure?: boolean; assetFailure?: boolean } = {}) {
  let currentAssets = [asset()];
  let assetListener: ((namespaceKey: string) => void) | null = null;
  const repositories = {
    projections: {
      get: vi.fn(async () => {
        if (options.projectionFailure) throw new Error("private database path");
        return {
          namespaceKey: "account-a",
          projectionKey: "reader-book:book-1",
          value: book(),
          fetchedAt: 1,
          schemaVersion: 1,
        };
      }),
      put: vi.fn(),
      delete: vi.fn(),
      deleteNamespace: vi.fn(),
    },
    publicationAssets: {
      list: vi.fn(async () => {
        if (options.assetFailure) throw new Error("private database path");
        return [...currentAssets];
      }),
      delete: vi.fn(async () => { currentAssets = []; }),
    },
    readerState: { deleteBookState: vi.fn(), deleteNamespace: vi.fn() },
    readerOutbox: { remove: vi.fn(), deleteNamespace: vi.fn() },
    close: vi.fn(),
  } as unknown as IndexedDbOfflineRepositories<Blob>;
  const dependencies: Partial<OfflineBookDetailDependencies> = {
    openRepositories: vi.fn(async () => repositories),
    subscribeAssetChanges: vi.fn((listener) => {
      assetListener = listener;
      return () => { assetListener = null; };
    }),
    subscribeFocus: vi.fn(() => () => undefined),
  };
  const controller = createOfflineBookDetailController({ namespaceKey: "account-a", bookId: "book-1" }, dependencies);
  return {
    controller,
    repositories,
    get assetListener() { return assetListener; },
    ready: (availability: string) => waitFor(() => (
      controller.getSnapshot().status === "ready" && controller.getSnapshot().detail?.availability === availability
    )),
  };
}

function book(): BookDetail {
  return {
    id: "book-1",
    title: "Cached Book",
    sortTitle: "Cached Book",
    subtitle: "A subtitle",
    authors: [{ id: "author-1", name: "Author One" }],
    series: { id: "series-1", name: "Series One", sortName: "Series One", seriesIndex: "2" },
    catalogTags: [],
    language: "en",
    publisher: "Publisher",
    publishedYear: 2026,
    publishedMonth: null,
    publishedDay: null,
    publishedDatePrecision: "year",
    coverUrl: "https://library.example/cover.jpg",
    description: "<p>Saved description</p>",
    identifiers: [],
    groups: [],
    file: { format: "epub", checksum: CHECKSUM_A, fileSize: 4, downloadUrl: "https://library.example/book.epub" },
  };
}

function asset(overrides: Partial<OfflinePublicationAssetCompleteRecord<Blob>> = {}): OfflinePublicationAssetCompleteRecord<Blob> {
  return {
    status: "complete",
    namespaceKey: "account-a",
    bookId: "book-1",
    format: "epub",
    checksum: CHECKSUM_A,
    byteLength: 4,
    schemaVersion: 1,
    payload: new Blob(["book"]),
    ...overrides,
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 30; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for offline Book Detail state");
}
