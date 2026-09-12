import type { OfflineReaderSyncClient } from "../../offline/reader/sync/OfflineReaderSync.Actions";
import type { OfflineReaderPendingSyncResult } from "../../offline/reader/sync/OfflineReaderPendingSync.Actions";
import { syncPendingOfflineReaderWork } from "../../offline/reader/sync/OfflineReaderPendingSync.Actions";
import { showOfflineReaderSyncOutcome } from "../../offline/reader/sync/notice/OfflineReaderSyncNotice.Controller";
import { getBrowserConnectivitySnapshot, subscribeToBrowserConnectivity } from "../../connectivity/BrowserConnectivity.State";
import { loadOfflineReaderBookMetadata } from "../../offline/reader/continuity/OfflineReaderOpen.Actions";
import {
  openIndexedDbOfflineRepositories,
  type IndexedDbOfflineRepositories,
} from "../../offline/storage/IndexedDbOfflineRepositories.Factory";
import type { OfflinePublicationAssetCompleteRecord } from "../../offline/storage/OfflineRepositories.Types";
import type { ReaderOutboxIntent } from "../../offline/reader/outbox/ReaderOutbox.Policy";
import type { BrowserConnectivityStatus } from "../../connectivity/BrowserConnectivity.State";
import type {
  OfflineReaderCoordinatedSyncInput,
  OfflineReaderCoordinatedSyncResult,
} from "../../offline/reader/sync/OfflineReaderCoordinatedSync.Actions";
import {
  addOfflineReaderSyncBookOutcome,
  createOfflineReaderSyncOutcome,
} from "../../offline/reader/sync/notice/OfflineReaderSyncOutcome.State";
import { presentOfflinePendingBooks, type OfflinePendingBook } from "./OfflinePendingBook.Presenter";
import { debugWarn } from "../../../lib/debug/DebugLogger.Diagnostics";
import { discardPendingReaderProgress } from "../../offline/reader/outbox/OfflineReaderPendingRepair.Actions";
import { offlineReaderRetryEligibility } from "../../offline/reader/retry/OfflineReaderRetryEligibility.Policy";
import {
  removeAllOfflinePublicationAssets,
  removeOfflinePublicationAsset,
} from "../../offline/publication/OfflinePublicationRemoval.Actions";

export type OfflineSettingsAsset = {
  key: string;
  bookId: string;
  format: string;
  byteLength: number;
  title: string;
  titleAvailable: boolean;
};

export type OfflineSettingsPendingSummary = {
  books: number;
  intents: number;
  sessionEstablishment: number;
  progress: number;
  annotations: number;
  attentionBooks: number;
  deferredBooks: number;
};

export type OfflineSettingsState = {
  status: "loading" | "ready" | "unavailable" | "error";
  connectivity: BrowserConnectivityStatus;
  pending: OfflineSettingsPendingSummary;
  pendingBooks: OfflinePendingBook[];
  assets: OfflineSettingsAsset[];
  totalAssetBytes: number;
  action: "idle" | "syncing" | "syncing-book" | "discarding-progress" | "removing" | "removing-all";
  activeBookId: string | null;
  removingAssetKey: string | null;
  message: string | null;
};

type Repositories = IndexedDbOfflineRepositories<Blob>;

export type OfflineSettingsDependencies = {
  openRepositories(): Promise<Repositories>;
  getConnectivitySnapshot(): BrowserConnectivityStatus;
  subscribeConnectivity(listener: () => void): () => void;
  subscribeFocus(listener: () => void): () => void;
  syncPending(input: {
    namespaceKey: string;
    client: OfflineReaderSyncClient;
    mode: "wait";
    attemptMode: "manual";
    isCurrent(): boolean;
    onCompleted(result: Extract<OfflineReaderPendingSyncResult, { status: "completed" }>): void;
  }): Promise<OfflineReaderPendingSyncResult>;
  showSyncOutcome(result: OfflineReaderPendingSyncResult): void;
  syncBook(input: OfflineReaderCoordinatedSyncInput): Promise<OfflineReaderCoordinatedSyncResult>;
  discardProgress: typeof discardPendingReaderProgress;
};

export type OfflineSettingsController = {
  getSnapshot(): OfflineSettingsState;
  subscribe(listener: () => void): () => void;
  start(): () => void;
  refresh(): Promise<void>;
  retrySync(): Promise<void>;
  retryBook(bookId: string): Promise<void>;
  discardPendingProgress(bookId: string): Promise<void>;
  removeAsset(asset: OfflineSettingsAsset): Promise<void>;
  removeAllAssets(): Promise<void>;
};

export function createOfflineSettingsController(
  input: { namespaceKey: string | null; client: OfflineReaderSyncClient | null },
  dependencyOverrides: Partial<OfflineSettingsDependencies> = {},
): OfflineSettingsController {
  const dependencies: OfflineSettingsDependencies = {
    openRepositories: () => openIndexedDbOfflineRepositories<Blob>(),
    getConnectivitySnapshot: getBrowserConnectivitySnapshot,
    subscribeConnectivity: subscribeToBrowserConnectivity,
    subscribeFocus: subscribeWindowFocus,
    syncPending: syncPendingOfflineReaderWork,
    showSyncOutcome: showOfflineReaderSyncOutcome,
    syncBook: syncProductionBook,
    discardProgress: discardPendingReaderProgress,
    ...dependencyOverrides,
  };
  const namespaceKey = input.namespaceKey?.trim() ?? "";
  const listeners = new Set<() => void>();
  let repositories: Repositories | null = null;
  let generation = 0;
  let started = false;
  let state = initialState(dependencies.getConnectivitySnapshot());

  const publish = (next: OfflineSettingsState) => {
    state = next;
    for (const listener of [...listeners]) listener();
  };
  const isCurrent = (expected: number) => started && generation === expected;

  const load = async (expected: number, message: string | null = null): Promise<void> => {
    const currentRepositories = repositories;
    if (!currentRepositories || !isCurrent(expected)) return;
    try {
      const [intents, records] = await Promise.all([
        currentRepositories.readerOutbox.list(namespaceKey),
        currentRepositories.publicationAssets.list(namespaceKey),
      ]);
      const bookIds = [...new Set([...intents.map((intent) => intent.bookId), ...records.map((record) => record.bookId)])];
      const titles = new Map(await Promise.all(bookIds.map(async (bookId) => [
        bookId,
        await loadBookTitle(namespaceKey, bookId, currentRepositories),
      ] as const)));
      const assets = records.map((record) => assetView(record, titles.get(record.bookId) ?? null));
      if (!isCurrent(expected)) return;
      assets.sort(compareAssets);
      publish({
        status: "ready",
        connectivity: dependencies.getConnectivitySnapshot(),
        pending: summarizePending(intents),
        pendingBooks: presentOfflinePendingBooks({ intents, titles, assets: records }),
        assets,
        totalAssetBytes: assets.reduce((total, asset) => total + asset.byteLength, 0),
        action: "idle",
        activeBookId: null,
        removingAssetKey: null,
        message,
      });
    } catch (error) {
      if (!isCurrent(expected)) return;
      debugWarn("reader", "offline Settings data could not be loaded", {
        namespaceKey,
        error,
      });
      publish({ ...state, status: "error", action: "idle", activeBookId: null, removingAssetKey: null, message: "Couldn't load offline data. Reload the app to try again." });
    }
  };

  const refresh = async () => {
    if (!started || state.action !== "idle") return;
    await load(generation);
  };

  const runAction = async (
    action: OfflineSettingsState["action"],
    operation: (currentRepositories: Repositories, expected: number) => Promise<void>,
    failureMessage: string,
    removingAssetKey: string | null = null,
    activeBookId: string | null = null,
  ) => {
    const currentRepositories = repositories;
    if (!currentRepositories || state.status !== "ready" || state.action !== "idle") return;
    const expected = generation;
    publish({ ...state, action, activeBookId, removingAssetKey, message: null });
    try {
      await operation(currentRepositories, expected);
    } catch (error) {
      debugWarn("reader", "offline Settings action did not complete", {
        action,
        activeBookId,
        removingAssetKey,
        error,
      });
      if (isCurrent(expected)) await load(expected, failureMessage);
    }
  };

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (started) return () => undefined;
      started = true;
      generation += 1;
      const expected = generation;
      if (!namespaceKey) {
        publish({ ...state, status: "unavailable", message: "Repair or reconnect to Second Pass Library to view offline data." });
        return () => { started = false; generation += 1; };
      }
      const unsubscribeConnectivity = dependencies.subscribeConnectivity(() => {
        if (!isCurrent(expected)) return;
        publish({ ...state, connectivity: dependencies.getConnectivitySnapshot() });
      });
      const unsubscribeFocus = dependencies.subscribeFocus(() => { void refresh(); });
      void (async () => {
        try {
          const opened = await dependencies.openRepositories();
          if (!isCurrent(expected)) {
            opened.close();
            return;
          }
          repositories = opened;
          await load(expected);
        } catch (error) {
          debugWarn("reader", "offline Settings storage could not be opened", { error });
          if (isCurrent(expected)) publish({ ...state, status: "error", message: "Offline data isn't available. Check browser storage settings and reload the app." });
        }
      })();
      return () => {
        if (!isCurrent(expected)) return;
        started = false;
        generation += 1;
        unsubscribeConnectivity();
        unsubscribeFocus();
        repositories?.close();
        repositories = null;
      };
    },
    refresh,
    async retrySync() {
      if (!input.client || state.connectivity !== "online" || state.pending.books === 0) {
        if (state.status === "ready" && state.connectivity !== "online") {
          publish({ ...state, message: "Go online before retrying sync." });
        }
        return;
      }
      await runAction("syncing", async (_repositories, expected) => {
        const result = await dependencies.syncPending({
          namespaceKey,
          client: input.client!,
          mode: "wait",
          attemptMode: "manual",
          isCurrent: () => isCurrent(expected),
          onCompleted: dependencies.showSyncOutcome,
        });
        if (!isCurrent(expected)) return;
        await load(expected, result.status === "failed" ? "Couldn't retry sync. Check your connection and try again." : null);
      }, "Couldn't retry sync. Check your connection and try again.");
    },
    async retryBook(bookId) {
      const normalizedBookId = bookId.trim();
      if (!input.client || !normalizedBookId || state.connectivity !== "online") {
        if (state.status === "ready" && state.connectivity !== "online") {
          publish({ ...state, message: "Go online before retrying sync." });
        }
        return;
      }
      if (!state.pendingBooks.some((book) => book.bookId === normalizedBookId)) return;
      await runAction("syncing-book", async (currentRepositories, expected) => {
        const result = await dependencies.syncBook({
          namespaceKey,
          bookId: normalizedBookId,
          client: input.client!,
          stateRepository: currentRepositories.readerState,
          outboxRepository: currentRepositories.readerOutbox,
          mode: "wait",
          attemptMode: "manual",
        });
        const completed: Extract<OfflineReaderPendingSyncResult, { status: "completed" }> = {
          status: "completed",
          discoveredBooks: 1,
          attemptedBooks: 1,
          outcome: addOfflineReaderSyncBookOutcome(createOfflineReaderSyncOutcome(), result),
        };
        dependencies.showSyncOutcome(completed);
        if (isCurrent(expected)) await load(expected);
      }, "Couldn't retry this Book. Check your connection and try again.", null, normalizedBookId);
    },
    async discardPendingProgress(bookId) {
      const normalizedBookId = bookId.trim();
      if (!normalizedBookId) return;
      await runAction("discarding-progress", async (currentRepositories, expected) => {
        await dependencies.discardProgress({
          namespaceKey,
          bookId: normalizedBookId,
          outboxRepository: currentRepositories.readerOutbox,
        });
        if (isCurrent(expected)) await load(expected);
      }, "Couldn't discard the pending reading position. Reload the app and try again.", null, normalizedBookId);
    },
    async removeAsset(asset) {
      await runAction("removing", async (currentRepositories, expected) => {
        await removeOfflinePublicationAsset({
          namespaceKey,
          bookId: asset.bookId,
          format: asset.format,
          assetRepository: currentRepositories.publicationAssets,
          coverRepository: currentRepositories.publicationCovers,
        });
        await load(expected);
      }, "Couldn't remove the offline copy. Try again.", asset.key);
    },
    async removeAllAssets() {
      await runAction("removing-all", async (currentRepositories, expected) => {
        await removeAllOfflinePublicationAssets({
          namespaceKey,
          assetRepository: currentRepositories.publicationAssets,
          coverRepository: currentRepositories.publicationCovers,
        });
        await load(expected);
      }, "Couldn't remove the offline copies. Try again.");
    },
  };
}

function initialState(connectivity: BrowserConnectivityStatus): OfflineSettingsState {
  return {
    status: "loading",
    connectivity,
    pending: { books: 0, intents: 0, sessionEstablishment: 0, progress: 0, annotations: 0, attentionBooks: 0, deferredBooks: 0 },
    pendingBooks: [],
    assets: [],
    totalAssetBytes: 0,
    action: "idle",
    activeBookId: null,
    removingAssetKey: null,
    message: null,
  };
}

function summarizePending(intents: readonly ReaderOutboxIntent[]): OfflineSettingsPendingSummary {
  const grouped = new Map<string, ReaderOutboxIntent[]>();
  for (const intent of intents) grouped.set(intent.bookId, [...(grouped.get(intent.bookId) ?? []), intent]);
  const statuses = [...grouped.values()].map((bookIntents) => bookIntents.map((intent) => (
    offlineReaderRetryEligibility({ intent, mode: "automatic", now: Date.now() })
  )));
  return {
    books: new Set(intents.map((intent) => intent.bookId)).size,
    intents: intents.length,
    sessionEstablishment: intents.filter((intent) => intent.type === "establish-session").length,
    progress: intents.filter((intent) => intent.type === "replace-progress").length,
    annotations: intents.filter((intent) => intent.type === "upsert-annotation" || intent.type === "delete-annotation").length,
    attentionBooks: statuses.filter((values) => values.includes("manual-only")).length,
    deferredBooks: statuses.filter((values) => values.includes("deferred") && !values.includes("manual-only")).length,
  };
}

function assetView(
  record: OfflinePublicationAssetCompleteRecord<Blob>,
  title: string | null,
): OfflineSettingsAsset {
  const normalizedTitle = title?.trim();
  return {
    key: JSON.stringify([record.bookId, record.format]),
    bookId: record.bookId,
    format: record.format,
    byteLength: record.payload.size,
    title: normalizedTitle || `Book ${shortBookId(record.bookId)}`,
    titleAvailable: Boolean(normalizedTitle),
  };
}

async function loadBookTitle(
  namespaceKey: string,
  bookId: string,
  repositories: Repositories,
): Promise<string | null> {
  const book = await loadOfflineReaderBookMetadata({
    namespaceKey,
    bookId,
    repository: repositories.projections,
  });
  return book?.title?.trim() || null;
}

async function syncProductionBook(
  input: OfflineReaderCoordinatedSyncInput,
): Promise<OfflineReaderCoordinatedSyncResult> {
  const { syncOfflineReaderWithCrossTabCoordination } = await import("../../offline/reader/sync/OfflineReaderCoordinatedSync.Actions");
  return syncOfflineReaderWithCrossTabCoordination(input);
}

function compareAssets(left: OfflineSettingsAsset, right: OfflineSettingsAsset): number {
  if (left.titleAvailable !== right.titleAvailable) return left.titleAvailable ? -1 : 1;
  return left.title.localeCompare(right.title) || left.bookId.localeCompare(right.bookId) || left.format.localeCompare(right.format);
}

function shortBookId(bookId: string): string {
  return bookId.length <= 12 ? bookId : `${bookId.slice(0, 8)}...`;
}

function subscribeWindowFocus(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("focus", listener);
  return () => window.removeEventListener("focus", listener);
}
