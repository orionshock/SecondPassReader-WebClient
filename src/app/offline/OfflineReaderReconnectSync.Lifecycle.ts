import type { BrowserConnectivityStatus } from "../connectivity/BrowserConnectivity.State";
import {
  getBrowserConnectivitySnapshot,
  subscribeToBrowserConnectivity,
} from "../connectivity/BrowserConnectivity.State";
import { debugWarn } from "../../lib/debug/DebugLogger.Diagnostics";
import type {
  OfflineReaderCoordinatedSyncInput,
  OfflineReaderCoordinatedSyncResult,
} from "./OfflineReaderCoordinatedSync.Actions";
import {
  openIndexedDbOfflineRepositories,
  type IndexedDbOfflineRepositories,
} from "./OfflineRepositories.IndexedDb";
import type { OfflineReaderSyncClient } from "./OfflineReaderSync.Actions";
import type { ReaderOutboxIntent } from "./ReaderOutbox.Policy";

const RECONNECT_BOOK_CONCURRENCY = 3;
const activeReconnectPasses = new Map<string, Promise<void>>();

type ReconnectRepositories = Pick<
  IndexedDbOfflineRepositories<Blob>,
  "readerState" | "readerOutbox" | "close"
>;

export type OfflineReaderReconnectSyncDependencies = {
  getConnectivitySnapshot(): BrowserConnectivityStatus;
  subscribeConnectivity(listener: () => void): () => void;
  openRepositories(): Promise<ReconnectRepositories>;
  syncBook(input: OfflineReaderCoordinatedSyncInput): Promise<OfflineReaderCoordinatedSyncResult>;
  reportFailure(operation: string, bookId?: string): void;
};

type ReconnectLifecycleInput = {
  namespaceKey: string | null;
  client: OfflineReaderSyncClient | null;
};

export function startOfflineReaderReconnectSyncLifecycle(
  input: ReconnectLifecycleInput,
  dependencyOverrides: Partial<OfflineReaderReconnectSyncDependencies> = {},
): () => void {
  const namespaceKey = input.namespaceKey?.trim() ?? "";
  if (!namespaceKey || !input.client) return () => undefined;

  const dependencies: OfflineReaderReconnectSyncDependencies = {
    getConnectivitySnapshot: getBrowserConnectivitySnapshot,
    subscribeConnectivity: subscribeToBrowserConnectivity,
    openRepositories: openProductionRepositories,
    syncBook: syncProductionBook,
    reportFailure: reportReconnectFailure,
    ...dependencyOverrides,
  };
  const client = input.client;
  let previousStatus = dependencies.getConnectivitySnapshot();
  let disposed = false;
  let activePass: Promise<void> | null = null;

  const requestPass = () => {
    if (disposed || activePass || activeReconnectPasses.has(namespaceKey)) return;
    const operation = runReconnectPass({ namespaceKey, client, dependencies, isDisposed: () => disposed });
    activePass = operation;
    activeReconnectPasses.set(namespaceKey, operation);
    const clear = () => {
      if (activePass === operation) activePass = null;
      if (activeReconnectPasses.get(namespaceKey) === operation) activeReconnectPasses.delete(namespaceKey);
    };
    void operation.then(clear, clear);
  };

  const unsubscribe = dependencies.subscribeConnectivity(() => {
    const nextStatus = dependencies.getConnectivitySnapshot();
    const reconnected = previousStatus === "offline" && nextStatus === "online";
    previousStatus = nextStatus;
    if (reconnected) requestPass();
  });

  return () => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
  };
}

async function openProductionRepositories(): Promise<ReconnectRepositories> {
  return openIndexedDbOfflineRepositories<Blob>();
}

async function syncProductionBook(
  input: OfflineReaderCoordinatedSyncInput,
): Promise<OfflineReaderCoordinatedSyncResult> {
  const { syncOfflineReaderWithCrossTabCoordination } = await import("./OfflineReaderCoordinatedSync.Actions");
  return syncOfflineReaderWithCrossTabCoordination(input);
}

async function runReconnectPass(input: {
  namespaceKey: string;
  client: OfflineReaderSyncClient;
  dependencies: OfflineReaderReconnectSyncDependencies;
  isDisposed(): boolean;
}): Promise<void> {
  let repositories: ReconnectRepositories;
  try {
    repositories = await input.dependencies.openRepositories();
  } catch {
    input.dependencies.reportFailure("open-repositories");
    return;
  }

  try {
    const intents = await repositories.readerOutbox.list(input.namespaceKey);
    const bookIds = pendingReaderSyncBookIds(intents);
    let nextIndex = 0;
    const worker = async () => {
      while (!input.isDisposed()) {
        const bookId = bookIds[nextIndex];
        nextIndex += 1;
        if (!bookId) return;
        try {
          const result = await input.dependencies.syncBook({
            namespaceKey: input.namespaceKey,
            bookId,
            client: input.client,
            stateRepository: repositories.readerState,
            outboxRepository: repositories.readerOutbox,
            mode: "if-available",
          });
          reportIncompleteResult(input.dependencies, bookId, result);
        } catch {
          input.dependencies.reportFailure("sync-book", bookId);
        }
      }
    };
    const workerCount = Math.min(RECONNECT_BOOK_CONCURRENCY, bookIds.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  } catch {
    input.dependencies.reportFailure("list-outbox");
  } finally {
    try {
      repositories.close();
    } catch {
      input.dependencies.reportFailure("close-repositories");
    }
  }
}

export function pendingReaderSyncBookIds(intents: readonly ReaderOutboxIntent[]): string[] {
  return [...new Set(intents.map((intent) => intent.bookId.trim()).filter(Boolean))].sort();
}

function reportIncompleteResult(
  dependencies: OfflineReaderReconnectSyncDependencies,
  bookId: string,
  result: OfflineReaderCoordinatedSyncResult,
): void {
  if (result.status === "busy") return;
  if (result.status !== "completed") {
    dependencies.reportFailure(`coordination-${result.status}`, bookId);
    return;
  }
  if (result.sync.status !== "synced" && result.sync.status !== "nothing-to-sync") {
    dependencies.reportFailure(`sync-${result.sync.status}`, bookId);
  }
}

function reportReconnectFailure(operation: string, bookId?: string): void {
  debugWarn("reader", "offline reconnect sync did not complete", {
    operation,
    ...(bookId ? { bookId } : {}),
  });
}
