import type { BookDetail } from "@secondpass/client";
import { subscribeToOfflineReaderOutboxChange } from "../../../app/offline/OfflineReaderOutboxChange.State";
import { loadOfflineReaderBookMetadata } from "../../../app/offline/OfflineReaderOpen.Actions";
import {
  openIndexedDbOfflineRepositories,
  type IndexedDbOfflineRepositories,
} from "../../../app/offline/OfflineRepositories.IndexedDb";
import type { OfflineProjectionRecord } from "../../../app/offline/OfflineRepositories.Types";
import { buildOfflineLibraryBooks } from "../../library/offline/OfflineLibrary.State";
import {
  OFFLINE_HOME_RECENT_PROJECTION_KEY,
  OFFLINE_HOME_SHELVES_PROJECTION_KEY,
} from "./OfflineHome.Constants";
import {
  presentOfflineHomeRecent,
  presentOfflineHomeShelves,
  type OfflineHomeRecentItem,
  type OfflineHomeShelfItem,
} from "./OfflineHome.State";
import type { OfflineHomeRecentProjection, OfflineHomeShelvesProjection } from "./OfflineHome.Types";

type Repositories = IndexedDbOfflineRepositories<Blob>;

export type OfflineHomeState = {
  status: "loading" | "ready" | "unavailable" | "error";
  recent: { status: "missing" | "available"; items: OfflineHomeRecentItem[]; cachedAt: number | null };
  shelves: { status: "missing" | "available"; items: OfflineHomeShelfItem[]; cachedAt: number | null };
};

export type OfflineHomeDependencies = {
  openRepositories(): Promise<Repositories>;
  subscribeReaderChanges(listener: (namespaceKey: string) => void): () => void;
  subscribeFocus(listener: () => void): () => void;
};

export type OfflineHomeController = {
  getSnapshot(): OfflineHomeState;
  subscribe(listener: () => void): () => void;
  start(): () => void;
  refresh(): Promise<void>;
};

export function createOfflineHomeController(
  namespaceKey: string | null,
  dependencyOverrides: Partial<OfflineHomeDependencies> = {},
): OfflineHomeController {
  const dependencies: OfflineHomeDependencies = {
    openRepositories: () => openIndexedDbOfflineRepositories<Blob>(),
    subscribeReaderChanges: subscribeToOfflineReaderOutboxChange,
    subscribeFocus: subscribeWindowFocus,
    ...dependencyOverrides,
  };
  const normalizedNamespaceKey = namespaceKey?.trim() ?? "";
  const listeners = new Set<() => void>();
  let state = emptyState("loading");
  let repositories: Repositories | null = null;
  let started = false;
  let generation = 0;
  let loadRevision = 0;

  const publish = (next: OfflineHomeState) => {
    state = next;
    for (const listener of [...listeners]) listener();
  };
  const isCurrent = (expectedGeneration: number, expectedLoad: number) => (
    started && generation === expectedGeneration && loadRevision === expectedLoad
  );

  const load = async (): Promise<void> => {
    const currentRepositories = repositories;
    if (!started || !currentRepositories) return;
    const expectedGeneration = generation;
    const expectedLoad = ++loadRevision;
    try {
      const [recentRead, shelfRead, assets] = await Promise.all([
        readProjection<OfflineHomeRecentProjection>(currentRepositories, normalizedNamespaceKey, OFFLINE_HOME_RECENT_PROJECTION_KEY),
        readProjection<OfflineHomeShelvesProjection>(currentRepositories, normalizedNamespaceKey, OFFLINE_HOME_SHELVES_PROJECTION_KEY),
        currentRepositories.publicationAssets.list(normalizedNamespaceKey).catch(() => []),
      ]);
      if (recentRead.status === "error" && shelfRead.status === "error") throw new Error("Offline Home projections unavailable");
      const recentRecord = recentRead.status === "loaded" ? recentRead.record : null;
      const shelfRecord = shelfRead.status === "loaded" ? shelfRead.record : null;
      const recentItems = validRecentItems(recentRecord?.value);
      const bookIds = [...new Set([...assets.map((asset) => asset.bookId), ...recentItems.map((item) => String(item.book.id))])];
      const [metadataEntries, readerStateEntries] = await Promise.all([
        Promise.all(bookIds.map(async (bookId) => [
          bookId,
          await loadOfflineReaderBookMetadata({
            namespaceKey: normalizedNamespaceKey,
            bookId,
            repository: currentRepositories.projections,
          }).catch(() => null),
        ] as const)),
        Promise.all(recentItems.map(async (item) => {
          const bookId = String(item.book.id);
          return [bookId, await currentRepositories.readerState.getBookState(normalizedNamespaceKey, bookId).catch(() => null)] as const;
        })),
      ]);
      if (!isCurrent(expectedGeneration, expectedLoad)) return;
      const metadata = new Map<string, BookDetail | null>(metadataEntries);
      const readableBookIds = new Set(buildOfflineLibraryBooks({ assets, metadata })
        .filter((book) => book.admission === "available")
        .map((book) => book.bookId));
      const shelves = validShelfItems(shelfRecord?.value);
      publish({
        status: "ready",
        recent: recentRecord && recentItems
          ? {
              status: "available",
              items: presentOfflineHomeRecent({
                cachedItems: recentItems,
                readerStates: new Map(readerStateEntries),
                readableBookIds,
              }),
              cachedAt: recentRecord.fetchedAt,
            }
          : { status: "missing", items: [], cachedAt: null },
        shelves: shelfRecord && shelves
          ? { status: "available", items: presentOfflineHomeShelves(shelves), cachedAt: shelfRecord.fetchedAt }
          : { status: "missing", items: [], cachedAt: null },
      });
    } catch {
      if (isCurrent(expectedGeneration, expectedLoad)) publish(emptyState("error"));
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
      const expectedGeneration = generation;
      if (!normalizedNamespaceKey) {
        publish(emptyState("unavailable"));
        return () => { started = false; generation += 1; };
      }
      const unsubscribeReader = dependencies.subscribeReaderChanges((changedNamespaceKey) => {
        if (changedNamespaceKey === normalizedNamespaceKey) void load();
      });
      const unsubscribeFocus = dependencies.subscribeFocus(() => { void load(); });
      void (async () => {
        try {
          const opened = await dependencies.openRepositories();
          if (!started || generation !== expectedGeneration) {
            opened.close();
            return;
          }
          repositories = opened;
          await load();
        } catch {
          if (started && generation === expectedGeneration) publish(emptyState("error"));
        }
      })();
      return () => {
        if (!started || generation !== expectedGeneration) return;
        started = false;
        generation += 1;
        loadRevision += 1;
        unsubscribeReader();
        unsubscribeFocus();
        repositories?.close();
        repositories = null;
      };
    },
    refresh: load,
  };
}

async function readProjection<T>(
  repositories: Repositories,
  namespaceKey: string,
  projectionKey: string,
): Promise<
  | { status: "loaded"; record: OfflineProjectionRecord<T> | null }
  | { status: "error" }
> {
  try {
    return { status: "loaded", record: await repositories.projections.get<T>(namespaceKey, projectionKey) };
  } catch {
    return { status: "error" };
  }
}

function validRecentItems(value: OfflineHomeRecentProjection | undefined): OfflineHomeRecentProjection["items"] {
  return Array.isArray(value?.items) ? value.items : [];
}

function validShelfItems(value: OfflineHomeShelvesProjection | undefined): OfflineHomeShelvesProjection["items"] {
  return Array.isArray(value?.items) ? value.items : [];
}

function emptyState(status: OfflineHomeState["status"]): OfflineHomeState {
  return {
    status,
    recent: { status: "missing", items: [], cachedAt: null },
    shelves: { status: "missing", items: [], cachedAt: null },
  };
}

function subscribeWindowFocus(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("focus", listener);
  return () => window.removeEventListener("focus", listener);
}
