import type { OfflineReaderSyncClient } from "../../offline/OfflineReaderSync.Actions";
import type { OfflineReaderPendingSyncResult } from "../../offline/OfflineReaderPendingSync.Actions";
import { syncPendingOfflineReaderWork } from "../../offline/OfflineReaderPendingSync.Actions";
import { showOfflineReaderSyncOutcome } from "../../offline/OfflineReaderSyncNotice.Controller";
import { getBrowserConnectivitySnapshot, subscribeToBrowserConnectivity } from "../../connectivity/BrowserConnectivity.State";
import { loadOfflineReaderBookMetadata } from "../../offline/OfflineReaderOpen.Actions";
import {
  openIndexedDbOfflineRepositories,
  type IndexedDbOfflineRepositories,
} from "../../offline/OfflineRepositories.IndexedDb";
import type { OfflinePublicationAssetCompleteRecord } from "../../offline/OfflineRepositories.Types";
import type { ReaderOutboxIntent } from "../../offline/ReaderOutbox.Policy";
import type { BrowserConnectivityStatus } from "../../connectivity/BrowserConnectivity.State";

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
};

export type OfflineSettingsState = {
  status: "loading" | "ready" | "unavailable" | "error";
  connectivity: BrowserConnectivityStatus;
  pending: OfflineSettingsPendingSummary;
  assets: OfflineSettingsAsset[];
  totalAssetBytes: number;
  action: "idle" | "syncing" | "removing" | "removing-all";
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
    isCurrent(): boolean;
    onCompleted(result: Extract<OfflineReaderPendingSyncResult, { status: "completed" }>): void;
  }): Promise<OfflineReaderPendingSyncResult>;
  showSyncOutcome(result: OfflineReaderPendingSyncResult): void;
};

export type OfflineSettingsController = {
  getSnapshot(): OfflineSettingsState;
  subscribe(listener: () => void): () => void;
  start(): () => void;
  refresh(): Promise<void>;
  retrySync(): Promise<void>;
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
      const assets = await Promise.all(records.map((record) => assetView(record, currentRepositories)));
      if (!isCurrent(expected)) return;
      assets.sort(compareAssets);
      publish({
        status: "ready",
        connectivity: dependencies.getConnectivitySnapshot(),
        pending: summarizePending(intents),
        assets,
        totalAssetBytes: assets.reduce((total, asset) => total + asset.byteLength, 0),
        action: "idle",
        removingAssetKey: null,
        message,
      });
    } catch {
      if (!isCurrent(expected)) return;
      publish({ ...state, status: "error", action: "idle", removingAssetKey: null, message: "Offline data could not be loaded." });
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
  ) => {
    const currentRepositories = repositories;
    if (!currentRepositories || state.status !== "ready" || state.action !== "idle") return;
    const expected = generation;
    publish({ ...state, action, removingAssetKey, message: null });
    try {
      await operation(currentRepositories, expected);
    } catch {
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
        publish({ ...state, status: "unavailable", message: "Offline management is unavailable for this connection." });
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
        } catch {
          if (isCurrent(expected)) publish({ ...state, status: "error", message: "Offline storage is unavailable." });
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
          publish({ ...state, message: "Connect to the library before retrying sync." });
        }
        return;
      }
      await runAction("syncing", async (_repositories, expected) => {
        const result = await dependencies.syncPending({
          namespaceKey,
          client: input.client!,
          mode: "wait",
          isCurrent: () => isCurrent(expected),
          onCompleted: dependencies.showSyncOutcome,
        });
        if (!isCurrent(expected)) return;
        await load(expected, result.status === "failed" ? "Sync could not be retried." : null);
      }, "Sync could not be retried.");
    },
    async removeAsset(asset) {
      await runAction("removing", async (currentRepositories, expected) => {
        await currentRepositories.publicationAssets.delete(namespaceKey, asset.bookId, asset.format);
        await load(expected);
      }, "The offline copy could not be removed.", asset.key);
    },
    async removeAllAssets() {
      await runAction("removing-all", async (currentRepositories, expected) => {
        await currentRepositories.publicationAssets.deleteNamespace(namespaceKey);
        await load(expected);
      }, "Offline copies could not be removed.");
    },
  };
}

function initialState(connectivity: BrowserConnectivityStatus): OfflineSettingsState {
  return {
    status: "loading",
    connectivity,
    pending: { books: 0, intents: 0, sessionEstablishment: 0, progress: 0, annotations: 0 },
    assets: [],
    totalAssetBytes: 0,
    action: "idle",
    removingAssetKey: null,
    message: null,
  };
}

function summarizePending(intents: readonly ReaderOutboxIntent[]): OfflineSettingsPendingSummary {
  return {
    books: new Set(intents.map((intent) => intent.bookId)).size,
    intents: intents.length,
    sessionEstablishment: intents.filter((intent) => intent.type === "establish-session").length,
    progress: intents.filter((intent) => intent.type === "replace-progress").length,
    annotations: intents.filter((intent) => intent.type === "upsert-annotation" || intent.type === "delete-annotation").length,
  };
}

async function assetView(
  record: OfflinePublicationAssetCompleteRecord<Blob>,
  repositories: Repositories,
): Promise<OfflineSettingsAsset> {
  const book = await loadOfflineReaderBookMetadata({
    namespaceKey: record.namespaceKey,
    bookId: record.bookId,
    repository: repositories.projections,
  });
  const title = book?.title?.trim();
  return {
    key: JSON.stringify([record.bookId, record.format]),
    bookId: record.bookId,
    format: record.format,
    byteLength: record.payload.size,
    title: title || `Book ${shortBookId(record.bookId)}`,
    titleAvailable: Boolean(title),
  };
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
