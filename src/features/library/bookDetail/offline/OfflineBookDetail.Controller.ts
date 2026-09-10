import type { BookDetail } from "@secondpass/client";
import { subscribeToOfflinePublicationAssetChange } from "../../../../app/offline/OfflinePublicationAssetChange.State";
import { loadOfflineReaderBookMetadata } from "../../../../app/offline/OfflineReaderOpen.Actions";
import {
  openIndexedDbOfflineRepositories,
  type IndexedDbOfflineRepositories,
} from "../../../../app/offline/OfflineRepositories.IndexedDb";
import { presentOfflineBookDetail, type OfflineBookDetail } from "./OfflineBookDetail.State";

type Repositories = IndexedDbOfflineRepositories<Blob>;

export type OfflineBookDetailState = {
  status: "loading" | "ready" | "unavailable" | "error";
  detail: OfflineBookDetail | null;
  action: "idle" | "removing";
  message: string | null;
};

export type OfflineBookDetailDependencies = {
  openRepositories(): Promise<Repositories>;
  subscribeAssetChanges(listener: (namespaceKey: string) => void): () => void;
  subscribeFocus(listener: () => void): () => void;
};

export type OfflineBookDetailController = {
  getSnapshot(): OfflineBookDetailState;
  subscribe(listener: () => void): () => void;
  start(): () => void;
  refresh(): Promise<void>;
  removeAsset(): Promise<void>;
};

export function createOfflineBookDetailController(
  input: { namespaceKey: string | null; bookId: string },
  dependencyOverrides: Partial<OfflineBookDetailDependencies> = {},
): OfflineBookDetailController {
  const dependencies: OfflineBookDetailDependencies = {
    openRepositories: () => openIndexedDbOfflineRepositories<Blob>(),
    subscribeAssetChanges: subscribeToOfflinePublicationAssetChange,
    subscribeFocus: subscribeWindowFocus,
    ...dependencyOverrides,
  };
  const namespaceKey = input.namespaceKey?.trim() ?? "";
  const bookId = input.bookId.trim();
  const listeners = new Set<() => void>();
  let repositories: Repositories | null = null;
  let started = false;
  let generation = 0;
  let loadRevision = 0;
  let actionRunning = false;
  let state: OfflineBookDetailState = { status: "loading", detail: null, action: "idle", message: null };

  const publish = (next: OfflineBookDetailState) => {
    state = next;
    for (const listener of [...listeners]) listener();
  };
  const isCurrent = (expectedGeneration: number, expectedLoad?: number) => (
    started && generation === expectedGeneration && (expectedLoad === undefined || loadRevision === expectedLoad)
  );

  const load = async (message: string | null = null): Promise<void> => {
    const currentRepositories = repositories;
    if (!started || !currentRepositories) return;
    const expectedGeneration = generation;
    const expectedLoad = ++loadRevision;
    const [bookRead, assetRead] = await Promise.all([
      readBook(currentRepositories, namespaceKey, bookId),
      readAssets(currentRepositories, namespaceKey, bookId),
    ]);
    if (!isCurrent(expectedGeneration, expectedLoad)) return;
    if (bookRead.status === "error" && assetRead.status === "error") {
      publish({ status: "error", detail: null, action: "idle", message: "Saved book details could not be loaded." });
      return;
    }
    publish({
      status: "ready",
      detail: presentOfflineBookDetail({
        bookId,
        book: bookRead.status === "loaded" ? bookRead.book : null,
        assets: assetRead.status === "loaded" ? assetRead.assets : [],
        assetReadFailed: assetRead.status === "error",
      }),
      action: "idle",
      message,
    });
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
      const expectedGeneration = generation;
      if (!namespaceKey || !bookId) {
        publish({ status: "unavailable", detail: null, action: "idle", message: null });
        return () => { started = false; generation += 1; };
      }
      const unsubscribeAssets = dependencies.subscribeAssetChanges((changedNamespaceKey) => {
        if (changedNamespaceKey === namespaceKey && !actionRunning) void load();
      });
      const unsubscribeFocus = dependencies.subscribeFocus(() => { if (!actionRunning) void load(); });
      void (async () => {
        try {
          const opened = await dependencies.openRepositories();
          if (!isCurrent(expectedGeneration)) {
            opened.close();
            return;
          }
          repositories = opened;
          await load();
        } catch {
          if (isCurrent(expectedGeneration)) {
            publish({ status: "error", detail: null, action: "idle", message: "Offline storage is unavailable." });
          }
        }
      })();
      return () => {
        if (!isCurrent(expectedGeneration)) return;
        started = false;
        generation += 1;
        loadRevision += 1;
        actionRunning = false;
        unsubscribeAssets();
        unsubscribeFocus();
        repositories?.close();
        repositories = null;
      };
    },
    refresh: load,
    async removeAsset() {
      const currentRepositories = repositories;
      const asset = state.detail?.asset;
      if (!currentRepositories || !asset || actionRunning || state.status !== "ready") return;
      actionRunning = true;
      const expectedGeneration = generation;
      publish({ ...state, action: "removing", message: null });
      try {
        await currentRepositories.publicationAssets.delete(namespaceKey, bookId, asset.format);
        if (isCurrent(expectedGeneration)) await load();
      } catch {
        if (isCurrent(expectedGeneration)) {
          publish({ ...state, action: "idle", message: "The offline copy could not be removed." });
        }
      } finally {
        if (isCurrent(expectedGeneration)) actionRunning = false;
      }
    },
  };
}

async function readBook(
  repositories: Repositories,
  namespaceKey: string,
  bookId: string,
): Promise<{ status: "loaded"; book: BookDetail | null } | { status: "error" }> {
  try {
    return {
      status: "loaded",
      book: await loadOfflineReaderBookMetadata({ namespaceKey, bookId, repository: repositories.projections }),
    };
  } catch {
    return { status: "error" };
  }
}

async function readAssets(
  repositories: Repositories,
  namespaceKey: string,
  bookId: string,
): Promise<
  | { status: "loaded"; assets: Awaited<ReturnType<Repositories["publicationAssets"]["list"]>> }
  | { status: "error" }
> {
  try {
    const assets = await repositories.publicationAssets.list(namespaceKey);
    return { status: "loaded", assets: assets.filter((asset) => asset.bookId === bookId) };
  } catch {
    return { status: "error" };
  }
}

function subscribeWindowFocus(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("focus", listener);
  return () => window.removeEventListener("focus", listener);
}
