import type { LocalReaderAnnotationCommitRepository } from "../../../../app/offline/reader/annotations/LocalReaderAnnotationCommit.Repository";
import type { MarginaliaBootstrap, MarginaliaSession } from "@secondpass/client";
import { describe, expect, it, vi } from "vitest";
import {
  buildBrowserOfflineSyncLockName,
  withBrowserOfflineSyncLock,
  type BrowserOfflineSyncLockManager,
} from "../../../../app/offline/reader/sync/BrowserOfflineSyncLock.Actions";
import { syncOfflineReaderWithCrossTabCoordination } from "../../../../app/offline/reader/sync/OfflineReaderCoordinatedSync.Actions";
import type {
  OfflineReaderBookState,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "../../../../app/offline/storage/OfflineRepositories.Types";

import type { OfflineReaderSyncClient } from "../../../../app/offline/reader/sync/OfflineReaderSync.Actions";
import { createInMemoryReaderRepositories } from "../../storage/OfflineRepositoryTest.Fixtures";

describe("browser offline sync lock", () => {
  it("serializes waiting callers for the same namespace and Book", async () => {
    const locks = new TestLockManager();
    const firstGate = deferred<void>();
    const events: string[] = [];

    const first = withLock(locks, async () => {
      events.push("first-start");
      await firstGate.promise;
      events.push("first-end");
      return "first";
    });
    const second = withLock(locks, async () => {
      events.push("second-start");
      return "second";
    });

    await waitFor(() => events.includes("first-start"));
    expect(events).toEqual(["first-start"]);
    firstGate.resolve();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: "completed", value: "first" },
      { status: "completed", value: "second" },
    ]);
    expect(events).toEqual(["first-start", "first-end", "second-start"]);
  });

  it("returns busy without running when conditional ownership is unavailable", async () => {
    const locks = new TestLockManager();
    const gate = deferred<void>();
    const owner = withLock(locks, async () => { await gate.promise; });
    await waitFor(() => locks.isHeld(lockName("account-a", "book-1")));
    const run = vi.fn(async () => "should-not-run");

    await expect(withBrowserOfflineSyncLock({
      namespaceKey: "account-a",
      bookId: "book-1",
      mode: "if-available",
      lockManager: locks,
      run,
    })).resolves.toEqual({ status: "busy" });
    expect(run).not.toHaveBeenCalled();
    gate.resolve();
    await owner;
  });

  it("does not couple different Books or namespaces", async () => {
    const locks = new TestLockManager();
    const gate = deferred<void>();
    const owner = withLock(locks, async () => { await gate.promise; return "owner"; });
    await waitFor(() => locks.isHeld(lockName("account-a", "book-1")));

    const otherBook = withBrowserOfflineSyncLock({
      namespaceKey: "account-a",
      bookId: "book-2",
      lockManager: locks,
      run: async () => "other-book",
    });
    const otherNamespace = withBrowserOfflineSyncLock({
      namespaceKey: "account-b",
      bookId: "book-1",
      lockManager: locks,
      run: async () => "other-account",
    });

    await expect(Promise.all([otherBook, otherNamespace])).resolves.toEqual([
      { status: "completed", value: "other-book" },
      { status: "completed", value: "other-account" },
    ]);
    gate.resolve();
    await owner;
  });

  it("releases ownership after callback failure and normalizes lock errors", async () => {
    const locks = new TestLockManager();
    const first = await withLock(locks, async () => {
      throw new Error("raw browser lock failure https://secret.invalid");
    });
    const second = await withLock(locks, async () => "recovered");

    expect(first).toEqual({ status: "failed" });
    expect(JSON.stringify(first)).not.toContain("secret.invalid");
    expect(second).toEqual({ status: "completed", value: "recovered" });

    const rejectedManager = {
      request: vi.fn(async () => { throw new Error("raw lock-manager failure"); }),
    } as unknown as BrowserOfflineSyncLockManager;
    await expect(withBrowserOfflineSyncLock({
      namespaceKey: "account-a",
      bookId: "book-1",
      lockManager: rejectedManager,
      run: async () => "unused",
    })).resolves.toEqual({ status: "failed" });
  });

  it("reports unavailable platform support without running", async () => {
    const run = vi.fn(async () => "unused");

    await expect(withBrowserOfflineSyncLock({
      namespaceKey: "account-a",
      bookId: "book-1",
      lockManager: null,
      run,
    })).resolves.toEqual({ status: "coordination-unavailable" });
    expect(run).not.toHaveBeenCalled();
  });
});

describe("coordinated offline Reader sync", () => {
  it("waits, then re-evaluates durable work after the first tab empties the outbox", async () => {
    const locks = new TestLockManager();
    const repositories = await repositoriesWithEstablishIntent();
    const authorityGate = deferred<MarginaliaBootstrap>();
    const client = syncClient();
    vi.mocked(client.marginalia.books.getActiveSession).mockReturnValue(authorityGate.promise);

    const first = coordinatedSync(locks, repositories, client);
    await waitFor(() => vi.mocked(client.marginalia.books.getActiveSession).mock.calls.length === 1);
    const waiting = coordinatedSync(locks, repositories, client);
    expect(locks.pending(lockName("account-a", "book-1"))).toBe(1);
    authorityGate.resolve(activeBootstrap("session-1"));

    await expect(first).resolves.toMatchObject({ status: "completed", sync: { status: "synced" } });
    await expect(waiting).resolves.toEqual({ status: "completed", sync: { status: "nothing-to-sync" } });
    expect(client.marginalia.books.getActiveSession).toHaveBeenCalledOnce();
    expect(client.marginalia.sessions.batchAnnotations).not.toHaveBeenCalled();
    expect(client.marginalia.sessions.replaceProgress).not.toHaveBeenCalled();
  });

  it("passes Phase 3D results through unchanged and introduces no start-over path", async () => {
    const locks = new TestLockManager();
    const repositories = await emptyRepositories();
    const client = syncClient();

    await expect(coordinatedSync(locks, repositories, client)).resolves.toEqual({
      status: "completed",
      sync: { status: "nothing-to-sync" },
    });
    expect("startOver" in client.marginalia.books).toBe(false);
  });
});

class TestLockManager implements BrowserOfflineSyncLockManager {
  private readonly held = new Set<string>();
  private readonly queues = new Map<string, Array<() => void>>();

  request<T>(
    name: string,
    options: { mode: "exclusive"; ifAvailable?: boolean },
    callback: (lock: { name: string } | null) => Promise<T>,
  ): Promise<T> {
    if (options.ifAvailable && this.held.has(name)) return callback(null);

    return new Promise<T>((resolve, reject) => {
      const execute = () => {
        this.held.add(name);
        void callback({ name }).then(resolve, reject).finally(() => {
          this.held.delete(name);
          const next = this.queues.get(name)?.shift();
          if (this.queues.get(name)?.length === 0) this.queues.delete(name);
          next?.();
        });
      };
      if (this.held.has(name)) {
        const queue = this.queues.get(name) ?? [];
        queue.push(execute);
        this.queues.set(name, queue);
      } else {
        execute();
      }
    });
  }

  isHeld(name: string): boolean {
    return this.held.has(name);
  }

  pending(name: string): number {
    return this.queues.get(name)?.length ?? 0;
  }
}

function withLock<T>(locks: BrowserOfflineSyncLockManager, run: () => Promise<T>) {
  return withBrowserOfflineSyncLock({
    namespaceKey: "account-a",
    bookId: "book-1",
    lockManager: locks,
    run,
  });
}

function lockName(namespaceKey: string, bookId: string): string {
  return buildBrowserOfflineSyncLockName(namespaceKey, bookId)!;
}

type Repositories = {
  stateRepository: OfflineReaderStateRepository;
  outboxRepository: ReaderOutboxRepository;
  annotationCommitRepository: LocalReaderAnnotationCommitRepository;
};

async function emptyRepositories(): Promise<Repositories> {
  return createInMemoryReaderRepositories();
}

async function repositoriesWithEstablishIntent(): Promise<Repositories> {
  const repositories = await emptyRepositories();
  const state: OfflineReaderBookState = {
    annotationRevision: 0,
    namespaceKey: "account-a",
    bookId: "book-1",
    schemaVersion: 1,
    session: {
      kind: "provisional",
      localSessionId: "local:continuity",
      serverSessionId: null,
      lastKnownServerStatus: null,
    },
    progress: null,
    annotations: [],
  };
  await repositories.stateRepository.putBookState(state);
  await repositories.outboxRepository.upsertIntent({
    type: "establish-session",
    namespaceKey: "account-a",
    bookId: "book-1",
  });
  return repositories;
}

function coordinatedSync(
  locks: BrowserOfflineSyncLockManager,
  repositories: Repositories,
  client: OfflineReaderSyncClient,
) {
  return syncOfflineReaderWithCrossTabCoordination({
    namespaceKey: "account-a",
    bookId: "book-1",
    lockManager: locks,
    client,
    ...repositories,
  });
}

function syncClient(): OfflineReaderSyncClient {
  return {
    marginalia: {
      books: {
        getActiveSession: vi.fn(async () => activeBootstrap("session-1")),
        open: vi.fn(async () => activeBootstrap("session-1")),
      },
      sessions: {
        batchAnnotations: vi.fn(async () => ({ annotations: [] })),
        replaceProgress: vi.fn(async (_sessionId, input) => ({
          progress: { ...input, updatedAt: "2026-01-01T00:00:00Z" },
        })),
      },
    },
  };
}

function activeBootstrap(id: string): MarginaliaBootstrap {
  return {
    created: false,
    context: { book: { id: "book-1", title: "Book", coverUrl: null, canOpen: true } },
    session: session(id),
    annotations: [],
    closedSessions: { count: 0, next: null, previous: null, results: [] },
  };
}

function session(id: string): MarginaliaSession {
  return {
    id,
    name: "",
    notes: "",
    status: "active",
    startedAt: "2026-01-01T00:00:00Z",
    closedAt: null,
    updatedAt: "2026-01-01T00:00:00Z",
    lastActivityAt: "2026-01-01T00:00:00Z",
    annotationCount: 0,
    progress: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (condition()) return;
    await Promise.resolve();
  }
  throw new Error("Condition was not reached.");
}
