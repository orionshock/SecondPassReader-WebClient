import type { BookDetail } from "@secondpass/client";
import { subscribeToOfflinePublicationAssetChange } from "../../../app/offline/OfflinePublicationAssetChange.State";
import { loadOfflineReaderBookMetadata } from "../../../app/offline/OfflineReaderOpen.Actions";
import {
  openIndexedDbOfflineRepositories,
  type IndexedDbOfflineRepositories,
} from "../../../app/offline/OfflineRepositories.IndexedDb";
import {
  buildOfflineLibraryBooks,
  searchOfflineLibraryBooks,
  type OfflineLibraryBook,
} from "./OfflineLibrary.State";

type Repositories = IndexedDbOfflineRepositories<Blob>;

export type OfflineLibraryState = {
  status: "loading" | "ready" | "unavailable" | "error";
  query: string;
  books: OfflineLibraryBook[];
  visibleBooks: OfflineLibraryBook[];
};

export type OfflineLibraryDependencies = {
  openRepositories(): Promise<Repositories>;
  subscribeAssetChanges(listener: (namespaceKey: string) => void): () => void;
  subscribeFocus(listener: () => void): () => void;
};

export type OfflineLibraryController = {
  getSnapshot(): OfflineLibraryState;
  subscribe(listener: () => void): () => void;
  start(): () => void;
  refresh(): Promise<void>;
  setQuery(query: string): void;
};

export function createOfflineLibraryController(
  namespaceKey: string | null,
  dependencyOverrides: Partial<OfflineLibraryDependencies> = {},
): OfflineLibraryController {
  const dependencies: OfflineLibraryDependencies = {
    openRepositories: () => openIndexedDbOfflineRepositories<Blob>(),
    subscribeAssetChanges: subscribeToOfflinePublicationAssetChange,
    subscribeFocus: subscribeWindowFocus,
    ...dependencyOverrides,
  };
  const normalizedNamespaceKey = namespaceKey?.trim() ?? "";
  const listeners = new Set<() => void>();
  let repositories: Repositories | null = null;
  let generation = 0;
  let loadRevision = 0;
  let started = false;
  let allBooks: OfflineLibraryBook[] = [];
  let state: OfflineLibraryState = {
    status: "loading",
    query: "",
    books: [],
    visibleBooks: [],
  };

  const publish = (next: OfflineLibraryState) => {
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
      const assets = await currentRepositories.publicationAssets.list(normalizedNamespaceKey);
      const metadata = new Map<string, BookDetail | null>();
      await Promise.all([...new Set(assets.map((asset) => asset.bookId))].map(async (bookId) => {
        metadata.set(bookId, await loadOfflineReaderBookMetadata({
          namespaceKey: normalizedNamespaceKey,
          bookId,
          repository: currentRepositories.projections,
        }));
      }));
      if (!isCurrent(expectedGeneration, expectedLoad)) return;
      allBooks = buildOfflineLibraryBooks({ assets, metadata });
      publish({
        status: "ready",
        query: state.query,
        books: allBooks,
        visibleBooks: searchOfflineLibraryBooks(allBooks, state.query),
      });
    } catch {
      if (!isCurrent(expectedGeneration, expectedLoad)) return;
      publish({ ...state, status: "error", books: [], visibleBooks: [] });
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
        publish({ ...state, status: "unavailable" });
        return () => {
          started = false;
          generation += 1;
        };
      }
      const unsubscribeAssets = dependencies.subscribeAssetChanges((changedNamespaceKey) => {
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
          if (started && generation === expectedGeneration) {
            publish({ ...state, status: "error" });
          }
        }
      })();
      return () => {
        if (!started || generation !== expectedGeneration) return;
        started = false;
        generation += 1;
        loadRevision += 1;
        unsubscribeAssets();
        unsubscribeFocus();
        repositories?.close();
        repositories = null;
      };
    },
    refresh: load,
    setQuery(query) {
      if (query === state.query) return;
      publish({
        ...state,
        query,
        visibleBooks: searchOfflineLibraryBooks(allBooks, query),
      });
    },
  };
}

function subscribeWindowFocus(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("focus", listener);
  return () => window.removeEventListener("focus", listener);
}
