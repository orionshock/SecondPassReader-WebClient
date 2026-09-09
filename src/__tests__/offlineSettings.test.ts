import { describe, expect, it, vi } from "vitest";
import {
  createOfflineSettingsController,
  type OfflineSettingsDependencies,
} from "../app/settings/offline/OfflineSettings.Controller";
import type { IndexedDbOfflineRepositories } from "../app/offline/OfflineRepositories.IndexedDb";
import type { OfflinePublicationAssetCompleteRecord } from "../app/offline/OfflineRepositories.Types";
import type { OfflineReaderSyncClient } from "../app/offline/OfflineReaderSync.Actions";
import type { ReaderOutboxIntent } from "../app/offline/ReaderOutbox.Policy";
import { createOfflineReaderSyncOutcome } from "../app/offline/OfflineReaderSyncOutcome.State";
import { formatOfflineAssetBytes } from "../app/settings/offline/OfflineSettings.Presenter";

describe("Offline Settings controller", () => {
  it("formats stored Blob sizes without a format-specific limit", () => {
    expect(formatOfflineAssetBytes(512)).toBe("512 B");
    expect(formatOfflineAssetBytes(2 * 1024 * 1024)).toBe("2.0 MB");
    expect(formatOfflineAssetBytes(3 * 1024 * 1024 * 1024)).toBe("3.0 GB");
  });

  it("loads namespace-scoped pending work and manageable publication assets", async () => {
    const harness = createHarness({
      intents: [establish("book-1"), progress("book-1"), annotation("book-2")],
      assets: [asset("account-a", "book-1", 3), asset("account-a", "very-long-book-identifier", 5)],
      titles: new Map([["book-1", "A Known Book"]]),
    });
    const stop = harness.controller.start();
    await harness.ready();

    expect(harness.controller.getSnapshot()).toMatchObject({
      status: "ready",
      pending: { books: 2, intents: 3, sessionEstablishment: 1, progress: 1, annotations: 1 },
      totalAssetBytes: 8,
      assets: [
        { bookId: "book-1", title: "A Known Book", titleAvailable: true },
        { bookId: "very-long-book-identifier", title: "Book very-lon...", titleAvailable: false },
      ],
    });
    expect(harness.repositories.readerOutbox.list).toHaveBeenCalledWith("account-a");
    expect(harness.repositories.publicationAssets.list).toHaveBeenCalledWith("account-a");
    stop();
  });

  it("does no repository work without a verified namespace", () => {
    const harness = createHarness({ namespaceKey: null });
    const stop = harness.controller.start();

    expect(harness.controller.getSnapshot()).toMatchObject({ status: "unavailable" });
    expect(harness.dependencies.openRepositories).not.toHaveBeenCalled();
    stop();
  });

  it("manually retries through the shared wait-mode sweep once and refreshes counts", async () => {
    const harness = createHarness({ intents: [progress("book-1")] });
    const gate = deferred<void>();
    harness.dependencies.syncPending.mockImplementation(async (input) => {
      await gate.promise;
      harness.setIntents([]);
      const result = completedSweep();
      input.onCompleted(result);
      return result;
    });
    const stop = harness.controller.start();
    await harness.ready();

    const first = harness.controller.retrySync();
    const duplicate = harness.controller.retrySync();
    expect(harness.dependencies.syncPending).toHaveBeenCalledOnce();
    expect(harness.dependencies.syncPending.mock.calls[0][0]).toMatchObject({
      namespaceKey: "account-a",
      mode: "wait",
    });
    gate.resolve();
    await Promise.all([first, duplicate]);

    expect(harness.dependencies.showSyncOutcome).toHaveBeenCalledOnce();
    expect(harness.controller.getSnapshot().pending).toMatchObject({ books: 0, intents: 0 });
    stop();
  });

  it.each(["offline", "unknown"] as const)("refuses manual retry while connectivity is %s", async (status) => {
    const harness = createHarness({ intents: [progress("book-1")], connectivity: status });
    const stop = harness.controller.start();
    await harness.ready();

    await harness.controller.retrySync();

    expect(harness.dependencies.syncPending).not.toHaveBeenCalled();
    expect(harness.controller.getSnapshot().message).toContain("Connect to the library");
    stop();
  });

  it("removes one Book format without touching Reader state, outbox, projections, or another asset", async () => {
    const harness = createHarness({ assets: [asset("account-a", "book-1", 3), asset("account-a", "book-2", 5)] });
    const stop = harness.controller.start();
    await harness.ready();
    const selected = harness.controller.getSnapshot().assets.find((item) => item.bookId === "book-1")!;

    await harness.controller.removeAsset(selected);

    expect(harness.repositories.publicationAssets.delete).toHaveBeenCalledWith("account-a", "book-1", "epub");
    expect(harness.controller.getSnapshot().assets.map((item) => item.bookId)).toEqual(["book-2"]);
    expect(harness.repositories.readerState.deleteNamespace).not.toHaveBeenCalled();
    expect(harness.repositories.readerOutbox.deleteNamespace).not.toHaveBeenCalled();
    expect(harness.repositories.projections.deleteNamespace).not.toHaveBeenCalled();
    stop();
  });

  it("removes all publication assets only in the current namespace", async () => {
    const harness = createHarness({
      assets: [asset("account-a", "book-1", 3), asset("account-a", "book-2", 5), asset("account-b", "book-3", 7)],
    });
    const stop = harness.controller.start();
    await harness.ready();

    await harness.controller.removeAllAssets();

    expect(harness.repositories.publicationAssets.deleteNamespace).toHaveBeenCalledWith("account-a");
    expect(harness.controller.getSnapshot().assets).toEqual([]);
    expect(harness.allAssets()).toEqual([expect.objectContaining({ namespaceKey: "account-b", bookId: "book-3" })]);
    expect(harness.repositories.readerState.deleteNamespace).not.toHaveBeenCalled();
    expect(harness.repositories.readerOutbox.deleteNamespace).not.toHaveBeenCalled();
    expect(harness.repositories.projections.deleteNamespace).not.toHaveBeenCalled();
    stop();
  });

  it("keeps actual assets visible when namespace removal fails", async () => {
    const harness = createHarness({ assets: [asset("account-a", "book-1", 3)] });
    harness.repositories.publicationAssets.deleteNamespace.mockRejectedValueOnce(new Error("raw failure"));
    const stop = harness.controller.start();
    await harness.ready();

    await harness.controller.removeAllAssets();

    expect(harness.controller.getSnapshot()).toMatchObject({
      status: "ready",
      message: "Offline copies could not be removed.",
      assets: [{ bookId: "book-1" }],
    });
    expect(harness.repositories.readerState.deleteNamespace).not.toHaveBeenCalled();
    expect(harness.repositories.readerOutbox.deleteNamespace).not.toHaveBeenCalled();
    expect(harness.repositories.projections.deleteNamespace).not.toHaveBeenCalled();
    stop();
  });

  it("does not race individual removal against remove-all", async () => {
    const harness = createHarness({ assets: [asset("account-a", "book-1", 3), asset("account-a", "book-2", 5)] });
    const gate = deferred<void>();
    harness.repositories.publicationAssets.deleteNamespace.mockImplementationOnce(async () => {
      await gate.promise;
      harness.removeNamespaceAssets("account-a");
    });
    const stop = harness.controller.start();
    await harness.ready();

    const removingAll = harness.controller.removeAllAssets();
    const removingOne = harness.controller.removeAsset(harness.controller.getSnapshot().assets[0]);

    expect(harness.repositories.publicationAssets.delete).not.toHaveBeenCalled();
    gate.resolve();
    await Promise.all([removingAll, removingOne]);
    expect(harness.controller.getSnapshot().assets).toEqual([]);
    stop();
  });

  it("normalizes removal failure, reloads actual state, and closes its repository lifecycle", async () => {
    const harness = createHarness({ assets: [asset("account-a", "book-1", 3)] });
    harness.repositories.publicationAssets.delete.mockRejectedValueOnce(new Error("raw IndexedDB failure"));
    const stop = harness.controller.start();
    await harness.ready();

    await harness.controller.removeAsset(harness.controller.getSnapshot().assets[0]);

    expect(harness.controller.getSnapshot()).toMatchObject({
      status: "ready",
      message: "The offline copy could not be removed.",
      assets: [{ bookId: "book-1" }],
    });
    expect(JSON.stringify(harness.controller.getSnapshot())).not.toContain("IndexedDB failure");
    stop();
    expect(harness.repositories.close).toHaveBeenCalledOnce();
    expect(harness.connectivity.listenerCount()).toBe(0);
    expect(harness.focus.listenerCount()).toBe(0);
  });

  it("refreshes durable summaries when the Settings window regains focus", async () => {
    const harness = createHarness({ intents: [progress("book-1")] });
    const stop = harness.controller.start();
    await harness.ready();
    harness.setIntents([]);

    harness.focus.emit();
    await waitFor(() => harness.controller.getSnapshot().pending.books === 0);

    expect(harness.repositories.readerOutbox.list).toHaveBeenCalledTimes(2);
    stop();
  });
});

function createHarness(options: {
  namespaceKey?: string | null;
  intents?: ReaderOutboxIntent[];
  assets?: OfflinePublicationAssetCompleteRecord<Blob>[];
  titles?: Map<string, string>;
  connectivity?: "online" | "offline" | "unknown";
} = {}) {
  let intents = options.intents ?? [];
  let assets = options.assets ?? [];
  const titles = options.titles ?? new Map<string, string>();
  const connectivity = subscriptions();
  const focus = subscriptions();
  let connectivityStatus = options.connectivity ?? "online";
  const publicationAssets = {
    get: vi.fn(async (namespaceKey: string, bookId: string, format: string) => (
      assets.find((item) => item.namespaceKey === namespaceKey && item.bookId === bookId && item.format === format) ?? null
    )),
    list: vi.fn(async (namespaceKey: string) => assets.filter((item) => item.namespaceKey === namespaceKey)),
    putComplete: vi.fn(async (record: OfflinePublicationAssetCompleteRecord<Blob>) => { assets.push(record); }),
    delete: vi.fn(async (namespaceKey: string, bookId: string, format: string) => {
      assets = assets.filter((item) => item.namespaceKey !== namespaceKey || item.bookId !== bookId || item.format !== format);
    }),
    deleteNamespace: vi.fn(async (namespaceKey: string) => {
      assets = assets.filter((item) => item.namespaceKey !== namespaceKey);
    }),
  };
  const projections = {
    get: vi.fn(async (namespaceKey: string, projectionKey: string) => {
      const bookId = projectionKey.replace("reader-book:", "");
      const title = titles.get(bookId);
      return title ? { namespaceKey, projectionKey, value: { id: bookId, title }, fetchedAt: 1, schemaVersion: 1 } : null;
    }),
    put: vi.fn(), delete: vi.fn(), deleteNamespace: vi.fn(),
  };
  const readerState = {
    getBookState: vi.fn(), putBookState: vi.fn(), deleteBookState: vi.fn(), deleteNamespace: vi.fn(),
  };
  const readerOutbox = {
    list: vi.fn(async (namespaceKey: string) => intents.filter((intent) => intent.namespaceKey === namespaceKey)),
    upsertIntent: vi.fn(), remove: vi.fn(), replace: vi.fn(), deleteNamespace: vi.fn(),
  };
  const repositories = {
    publicationAssets,
    projections,
    readerState,
    readerOutbox,
    close: vi.fn(),
  } as unknown as IndexedDbOfflineRepositories<Blob>;
  const dependencies = {
    openRepositories: vi.fn(async () => repositories),
    getConnectivitySnapshot: vi.fn(() => connectivityStatus),
    subscribeConnectivity: connectivity.subscribe,
    subscribeFocus: focus.subscribe,
    syncPending: vi.fn<OfflineSettingsDependencies["syncPending"]>(async () => completedSweep()),
    showSyncOutcome: vi.fn(),
  } satisfies OfflineSettingsDependencies;
  const controller = createOfflineSettingsController({
    namespaceKey: options.namespaceKey === undefined ? "account-a" : options.namespaceKey,
    client: {} as OfflineReaderSyncClient,
  }, dependencies);
  return {
    controller,
    dependencies,
    repositories: repositories as unknown as {
      publicationAssets: typeof publicationAssets;
      projections: typeof projections;
      readerState: typeof readerState;
      readerOutbox: typeof readerOutbox;
      close: ReturnType<typeof vi.fn>;
    },
    connectivity,
    focus,
    setIntents(next: ReaderOutboxIntent[]) { intents = next; },
    allAssets: () => assets,
    removeNamespaceAssets(namespaceKey: string) {
      assets = assets.filter((item) => item.namespaceKey !== namespaceKey);
    },
    async ready() { await waitFor(() => controller.getSnapshot().status !== "loading"); },
    setConnectivity(status: typeof connectivityStatus) {
      connectivityStatus = status;
      connectivity.emit();
    },
  };
}

function subscriptions() {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    emit() { for (const listener of [...listeners]) listener(); },
    listenerCount: () => listeners.size,
  };
}

function asset(namespaceKey: string, bookId: string, bytes: number): OfflinePublicationAssetCompleteRecord<Blob> {
  return {
    status: "complete",
    namespaceKey,
    bookId,
    format: "epub",
    checksum: "a".repeat(64),
    byteLength: bytes,
    schemaVersion: 1,
    payload: new Blob([new Uint8Array(bytes)]),
  };
}

function establish(bookId: string): ReaderOutboxIntent {
  return { type: "establish-session", namespaceKey: "account-a", bookId };
}

function progress(bookId: string): ReaderOutboxIntent {
  return {
    type: "replace-progress",
    namespaceKey: "account-a",
    bookId,
    serverSessionId: null,
    intentRevision: 1,
    progress: { cfi: "epubcfi(/6/2)", percentage: 10, locationLabel: "010% - Chapter" },
  };
}

function annotation(bookId: string): ReaderOutboxIntent {
  return {
    type: "upsert-annotation",
    namespaceKey: "account-a",
    bookId,
    serverSessionId: null,
    intentRevision: 1,
    origin: { kind: "local-unconfirmed" },
    annotation: { clientId: "annotation-1", kind: "bookmark", location: { cfi: "epubcfi(/6/2)" } },
  };
}

function completedSweep() {
  return {
    status: "completed" as const,
    discoveredBooks: 1,
    attemptedBooks: 1,
    outcome: createOfflineReaderSyncOutcome(),
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  return { promise: new Promise<T>((done) => { resolve = done; }), resolve };
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (condition()) return;
    await Promise.resolve();
  }
  throw new Error("Condition was not reached.");
}
