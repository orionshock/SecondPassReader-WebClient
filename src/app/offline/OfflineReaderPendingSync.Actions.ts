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
import {
  addOfflineReaderSyncBookOutcome,
  createOfflineReaderSyncOutcome,
  type OfflineReaderPendingSyncOutcome,
} from "./OfflineReaderSyncOutcome.State";
import type { ReaderOutboxIntent } from "./ReaderOutbox.Policy";

const PENDING_SYNC_BOOK_CONCURRENCY = 3;
const activePendingSyncs = new Map<string, Promise<OfflineReaderPendingSyncResult>>();

type PendingSyncRepositories = Pick<
  IndexedDbOfflineRepositories<Blob>,
  "readerState" | "readerOutbox" | "close"
>;

export type OfflineReaderPendingSyncResult =
  | {
      status: "completed";
      discoveredBooks: number;
      attemptedBooks: number;
      outcome: OfflineReaderPendingSyncOutcome;
    }
  | { status: "cancelled" }
  | { status: "failed"; stage: "open-repositories" | "list-outbox" };

export type OfflineReaderPendingSyncDependencies = {
  openRepositories(): Promise<PendingSyncRepositories>;
  syncBook(input: OfflineReaderCoordinatedSyncInput): Promise<OfflineReaderCoordinatedSyncResult>;
  reportFailure(operation: string, bookId?: string): void;
};

type PendingSyncInput = {
  namespaceKey: string;
  client: OfflineReaderSyncClient;
  isCurrent?: () => boolean;
  onCompleted?: (result: Extract<OfflineReaderPendingSyncResult, { status: "completed" }>) => void;
};

export function syncPendingOfflineReaderWork(
  input: PendingSyncInput,
  dependencyOverrides: Partial<OfflineReaderPendingSyncDependencies> = {},
): Promise<OfflineReaderPendingSyncResult> {
  const namespaceKey = input.namespaceKey.trim();
  if (!namespaceKey) return Promise.resolve({ status: "failed", stage: "list-outbox" });

  const active = activePendingSyncs.get(namespaceKey);
  if (active) return active;

  const dependencies: OfflineReaderPendingSyncDependencies = {
    openRepositories: openProductionRepositories,
    syncBook: syncProductionBook,
    reportFailure: reportPendingSyncFailure,
    ...dependencyOverrides,
  };
  const operation = runPendingSync({
    namespaceKey,
    client: input.client,
    isCurrent: input.isCurrent ?? (() => true),
    onCompleted: input.onCompleted,
    dependencies,
  });
  activePendingSyncs.set(namespaceKey, operation);
  const clear = () => {
    if (activePendingSyncs.get(namespaceKey) === operation) activePendingSyncs.delete(namespaceKey);
  };
  void operation.then(clear, clear);
  return operation;
}

async function openProductionRepositories(): Promise<PendingSyncRepositories> {
  return openIndexedDbOfflineRepositories<Blob>();
}

async function syncProductionBook(
  input: OfflineReaderCoordinatedSyncInput,
): Promise<OfflineReaderCoordinatedSyncResult> {
  const { syncOfflineReaderWithCrossTabCoordination } = await import("./OfflineReaderCoordinatedSync.Actions");
  return syncOfflineReaderWithCrossTabCoordination(input);
}

async function runPendingSync(input: {
  namespaceKey: string;
  client: OfflineReaderSyncClient;
  isCurrent(): boolean;
  onCompleted?: (result: Extract<OfflineReaderPendingSyncResult, { status: "completed" }>) => void;
  dependencies: OfflineReaderPendingSyncDependencies;
}): Promise<OfflineReaderPendingSyncResult> {
  if (!input.isCurrent()) return { status: "cancelled" };

  let repositories: PendingSyncRepositories;
  try {
    repositories = await input.dependencies.openRepositories();
  } catch {
    input.dependencies.reportFailure("open-repositories");
    return { status: "failed", stage: "open-repositories" };
  }

  try {
    const intents = await repositories.readerOutbox.list(input.namespaceKey);
    const bookIds = pendingReaderSyncBookIds(intents);
    let outcome = createOfflineReaderSyncOutcome();
    let nextIndex = 0;
    let attemptedBooks = 0;
    const worker = async () => {
      while (input.isCurrent()) {
        const bookId = bookIds[nextIndex];
        nextIndex += 1;
        if (!bookId) return;
        attemptedBooks += 1;
        try {
          const result = await input.dependencies.syncBook({
            namespaceKey: input.namespaceKey,
            bookId,
            client: input.client,
            stateRepository: repositories.readerState,
            outboxRepository: repositories.readerOutbox,
            mode: "if-available",
          });
          outcome = addOfflineReaderSyncBookOutcome(outcome, result);
          reportIncompleteResult(input.dependencies, bookId, result);
        } catch {
          outcome.failedBooks += 1;
          input.dependencies.reportFailure("sync-book", bookId);
        }
      }
    };
    const workerCount = Math.min(PENDING_SYNC_BOOK_CONCURRENCY, bookIds.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    const result = { status: "completed", discoveredBooks: bookIds.length, attemptedBooks, outcome } as const;
    if (input.isCurrent() && input.onCompleted) {
      try {
        input.onCompleted(result);
      } catch {
        input.dependencies.reportFailure("publish-outcome");
      }
    }
    return result;
  } catch {
    input.dependencies.reportFailure("list-outbox");
    return { status: "failed", stage: "list-outbox" };
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
  dependencies: OfflineReaderPendingSyncDependencies,
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

function reportPendingSyncFailure(operation: string, bookId?: string): void {
  debugWarn("reader", "pending offline Reader sync did not complete", {
    operation,
    ...(bookId ? { bookId } : {}),
  });
}
