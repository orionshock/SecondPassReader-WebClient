import type { BookDetail, MarginaliaRecentSession, Shelf } from "@secondpass/client";
import { describe, expect, it, vi } from "vitest";
import {
  createOfflineHomeController,
  type OfflineHomeDependencies,
} from "../../../features/home/offline/OfflineHome.Controller";
import { presentOfflineHomeRecent, presentOfflineHomeShelves } from "../../../features/home/offline/OfflineHome.Presenter";
import type { IndexedDbOfflineRepositories } from "../../../app/offline/storage/IndexedDbOfflineRepositories.Factory";
import type { OfflineReaderBookState } from "../../../app/offline/storage/OfflineRepositories.Types";

const CHECKSUM = "a".repeat(64);

describe("offline Home presentation", () => {
  it("preserves cached membership, order, and server Session fields while overlaying local progress", () => {
    const cached = [recent("book-b", "Second", "closed"), recent("book-a", "First", "active")];
    const local = readerState("book-b", "epubcfi(/6/99)", "087% - Chapter 9");
    const items = presentOfflineHomeRecent({
      cachedItems: cached,
      readerStates: new Map([["book-b", local], ["not-recent", readerState("not-recent", "cfi", "label")]]),
      readableBookIds: new Set(["book-b"]),
    });

    expect(items.map((item) => item.bookId)).toEqual(["book-b", "book-a"]);
    expect(items[0]).toMatchObject({
      sessionId: "session-book-b",
      sessionStatus: "closed",
      lastActivityAt: "2026-08-02T12:00:00Z",
      offlineReadable: true,
      progress: {
        cfi: "epubcfi(/6/99)",
        percentage: 87,
        locationLabel: "087% - Chapter 9",
        source: "local",
      },
    });
    expect(items).toHaveLength(2);
  });

  it("uses cached progress when no local desired position exists", () => {
    const [item] = presentOfflineHomeRecent({
      cachedItems: [recent("book-a", "First")],
      readerStates: new Map(),
      readableBookIds: new Set(),
    });

    expect(item.progress).toMatchObject({
      cfi: "epubcfi(/6/8)",
      locationLabel: "042% - Chapter 4",
      percentage: null,
      source: "cached-server",
    });
  });

  it("keeps cached shelf order and produces read-only summaries", () => {
    const shelves = presentOfflineHomeShelves([
      shelf("second", "Second Shelf", 2),
      shelf("first", "First Shelf", 1),
    ]);

    expect(shelves.map((item) => item.shelfId)).toEqual(["second", "first"]);
    expect(shelves[0]).toMatchObject({ name: "Second Shelf", bookCount: 2, ownerLabel: "Reader" });
  });
});

describe("offline Home controller", () => {
  it("loads namespace snapshots, overlays Reader state, and admits only verified local EPUBs", async () => {
    const harness = createHarness();
    const stop = harness.controller.start();
    await harness.ready();

    const state = harness.controller.getSnapshot();
    expect(state.recent).toMatchObject({
      status: "available",
      items: [expect.objectContaining({ bookId: "book-1", offlineReadable: true })],
    });
    expect(state.shelves).toMatchObject({ status: "available", items: [expect.objectContaining({ shelfId: "shelf-1" })] });
    expect(harness.repositories.publicationAssets.list).toHaveBeenCalledWith("account-a");
    expect(harness.repositories.readerState.getBookState).toHaveBeenCalledWith("account-a", "book-1");

    stop();
    expect(harness.repositories.close).toHaveBeenCalledOnce();
  });

  it("renders a valid cached section when another projection is missing", async () => {
    const harness = createHarness({ shelvesMissing: true });
    harness.controller.start();
    await harness.ready();

    expect(harness.controller.getSnapshot()).toMatchObject({
      status: "ready",
      recent: { status: "available" },
      shelves: { status: "missing" },
    });
  });

  it("keeps cached Recent usable when the Reader overlay cannot be read", async () => {
    const harness = createHarness({ readerFailure: true });
    harness.controller.start();
    await harness.ready();

    const recentState = harness.controller.getSnapshot().recent;
    expect(recentState.status).toBe("available");
    expect(recentState.items[0]).toMatchObject({ bookId: "book-1" });
    expect(recentState.items[0]?.progress).toMatchObject({
      source: "cached-server",
      locationLabel: "042% - Chapter 4",
    });
  });

  it("refreshes matching local Reader changes without reacting across namespaces", async () => {
    const harness = createHarness();
    harness.controller.start();
    await harness.ready();
    const reads = vi.mocked(harness.repositories.projections.get).mock.calls.length;

    harness.readerListener?.("account-b");
    await Promise.resolve();
    expect(harness.repositories.projections.get).toHaveBeenCalledTimes(reads);

    harness.readerListener?.("account-a");
    await waitFor(() => vi.mocked(harness.repositories.projections.get).mock.calls.length > reads);
  });

  it("does no repository work without a verified namespace", () => {
    const openRepositories = vi.fn();
    const controller = createOfflineHomeController(null, { openRepositories });
    const stop = controller.start();

    expect(controller.getSnapshot().status).toBe("unavailable");
    expect(openRepositories).not.toHaveBeenCalled();
    stop();
  });

  it("normalizes complete cached projection read failure", async () => {
    const harness = createHarness({ projectionFailure: true });
    harness.controller.start();
    await waitFor(() => harness.controller.getSnapshot().status === "error");

    expect(JSON.stringify(harness.controller.getSnapshot())).not.toContain("private projection path");
  });
});

function createHarness(options: { shelvesMissing?: boolean; projectionFailure?: boolean; readerFailure?: boolean } = {}) {
  let readerListener: ((namespaceKey: string) => void) | null = null;
  const recentProjection = {
    namespaceKey: "account-a",
    projectionKey: "home-recent",
    value: { items: [recent("book-1", "Cached Book")] },
    fetchedAt: 10,
    schemaVersion: 1,
  };
  const shelvesProjection = options.shelvesMissing ? null : {
    namespaceKey: "account-a",
    projectionKey: "home-shelves",
    value: { items: [shelf("shelf-1", "Favorites", 1)] },
    fetchedAt: 20,
    schemaVersion: 1,
  };
  const bookProjection = {
    namespaceKey: "account-a",
    projectionKey: "reader-book:book-1",
    value: bookDetail(),
    fetchedAt: 30,
    schemaVersion: 1,
  };
  const repositories = {
    projections: {
      get: vi.fn(async (_namespaceKey: string, key: string) => {
        if (options.projectionFailure && (key === "home-recent" || key === "home-shelves")) {
          throw new Error("private projection path");
        }
        return key === "home-recent" ? recentProjection : key === "home-shelves" ? shelvesProjection : bookProjection;
      }),
    },
    publicationAssets: {
      list: vi.fn(async () => [{
        status: "complete",
        namespaceKey: "account-a",
        bookId: "book-1",
        format: "epub",
        checksum: CHECKSUM,
        byteLength: 4,
        schemaVersion: 1,
        payload: new Blob(["book"]),
      }]),
    },
    readerState: {
      getBookState: vi.fn(async () => {
        if (options.readerFailure) throw new Error("reader state unavailable");
        return readerState("book-1", "epubcfi(/6/10)", "051% - Chapter 5");
      }),
    },
    close: vi.fn(),
  } as unknown as IndexedDbOfflineRepositories<Blob>;
  const dependencies: Partial<OfflineHomeDependencies> = {
    openRepositories: vi.fn(async () => repositories),
    subscribeReaderChanges: vi.fn((listener) => {
      readerListener = listener;
      return () => { readerListener = null; };
    }),
    subscribeFocus: vi.fn(() => () => undefined),
  };
  const controller = createOfflineHomeController("account-a", dependencies);
  return {
    controller,
    repositories,
    get readerListener() { return readerListener; },
    ready: () => waitFor(() => controller.getSnapshot().status === "ready"),
  };
}

function recent(bookId: string, title: string, status: "active" | "closed" = "active"): MarginaliaRecentSession {
  return {
    id: `session-${bookId}`,
    name: "Reading session",
    status,
    lastActivityAt: "2026-08-02T12:00:00Z",
    book: { id: bookId, title, coverUrl: "https://library.example/cover.jpg", canOpen: true },
    progress: { cfi: "epubcfi(/6/8)", locationLabel: "042% - Chapter 4", updatedAt: "2026-08-02T12:00:00Z" },
  };
}

function readerState(bookId: string, cfi: string, locationLabel: string): OfflineReaderBookState {
  return {
    namespaceKey: "account-a",
    bookId,
    schemaVersion: 1,
    session: { kind: "provisional", localSessionId: `local:${bookId}`, serverSessionId: null, lastKnownServerStatus: null },
    progress: { cfi, locationLabel, percentage: 87 },
    annotations: [],
  };
}

function shelf(id: string, name: string, itemCount: number): Shelf {
  return {
    id,
    name,
    owner_type: "user",
    owner_user: { profile_id: "reader", display_name: "Reader" },
    item_count: itemCount,
    preview_books: [{ id: "book-1", title: "Cached Book", cover_url: "https://library.example/cover.jpg" }],
  };
}

function bookDetail(): BookDetail {
  return {
    id: "book-1",
    title: "Cached Book",
    authors: [],
    catalogTags: [],
    groups: [],
    file: { format: "epub", checksum: CHECKSUM, fileSize: 4, downloadUrl: "https://library.example/book.epub" },
  } as unknown as BookDetail;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 30; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for offline Home state");
}
