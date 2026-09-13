import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import { loadOrCreateOfflineReaderContinuity } from "../../../../app/offline/reader/continuity/OfflineReaderContinuity.Controller";
import {
  canWriteLocalReaderState,
  isProvisionalReaderSession,
  selectOfflineReaderSession,
  type OfflineReaderSession,
} from "../../../../app/offline/reader/continuity/OfflineReaderSession.Policy";
import { openIndexedDbOfflineRepositories } from "../../../../app/offline/storage/IndexedDbOfflineRepositories.Factory";
import type {
  OfflineReaderBookState,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "../../../../app/offline/storage/OfflineRepositories.Types";
import { createInMemoryOfflineRepositoryFactories } from "../../storage/OfflineRepositoryTest.Fixtures";

describe("offline Reader Session policy", () => {
  it("prefers a last-known-active server-confirmed Session", () => {
    const confirmed = serverSession("active");

    const selected = selectOfflineReaderSession({
      existingSession: confirmed,
      generateLocalId: () => "unused",
    });

    expect(selected).toEqual({ session: confirmed, source: "confirmed-active" });
    expect(canWriteLocalReaderState(selected.session)).toBe(true);
  });

  it.each(["closed", null] as const)(
    "never selects a server-confirmed Session with %s authority as writable",
    (status) => {
      const confirmed = serverSession(status);

      const selected = selectOfflineReaderSession({
        existingSession: confirmed,
        generateLocalId: () => "continuation-id",
      });

      expect(canWriteLocalReaderState(confirmed)).toBe(false);
      expect(selected.source).toBe("created-provisional");
      expect(selected.session).toEqual({
        kind: "provisional",
        localSessionId: "local:continuation-id",
        serverSessionId: null,
        lastKnownServerStatus: null,
      });
    },
  );

  it("creates a clearly local provisional identity when no Session exists", () => {
    const selected = selectOfflineReaderSession({ generateLocalId: () => "new-id" });

    expect(isProvisionalReaderSession(selected.session)).toBe(true);
    expect(selected.session.localSessionId).toBe("local:new-id");
    expect(selected.session.serverSessionId).toBeNull();
    expect(canWriteLocalReaderState(selected.session)).toBe(true);
  });
});

describe("offline Reader continuity persistence", () => {
  it("reuses one provisional Session and coalesces one establishment intent", async () => {
    const repositories = await inMemoryReaderRepositories();
    const generateLocalId = vi.fn(() => "stable-id");

    const first = await loadOrCreateOfflineReaderContinuity({
      namespaceKey: "account-a",
      bookId: "book-1",
      ...repositories,
      generateLocalId,
    });
    const second = await loadOrCreateOfflineReaderContinuity({
      namespaceKey: "account-a",
      bookId: "book-1",
      ...repositories,
      generateLocalId,
    });

    expect(first.state.session.localSessionId).toBe("local:stable-id");
    expect(second.state.session).toEqual(first.state.session);
    expect(second.selection).toBe("existing-provisional");
    expect(generateLocalId).toHaveBeenCalledTimes(1);
    expect(await repositories.outboxRepository.list("account-a")).toEqual([
      { type: "establish-session", namespaceKey: "account-a", bookId: "book-1" },
    ]);
  });

  it("converges concurrent same-runtime loads on one provisional identity", async () => {
    const repositories = await inMemoryReaderRepositories();
    const generateLocalId = vi.fn(() => "concurrent-id");

    const [first, second] = await Promise.all([
      ensure("account-a", "book-1", repositories, generateLocalId),
      ensure("account-a", "book-1", repositories, generateLocalId),
    ]);

    expect(first.state.session).toEqual(second.state.session);
    expect(generateLocalId).toHaveBeenCalledTimes(1);
    expect(await repositories.outboxRepository.list("account-a")).toHaveLength(1);
  });

  it("keeps Book and account provisional identities isolated", async () => {
    const repositories = await inMemoryReaderRepositories();
    let sequence = 0;
    const generateLocalId = () => `id-${sequence += 1}`;

    const first = await ensure("account-a", "book-1", repositories, generateLocalId);
    const otherBook = await ensure("account-a", "book-2", repositories, generateLocalId);
    const otherAccount = await ensure("account-b", "book-1", repositories, generateLocalId);

    expect(new Set([
      first.state.session.localSessionId,
      otherBook.state.session.localSessionId,
      otherAccount.state.session.localSessionId,
    ]).size).toBe(3);
    expect(await repositories.outboxRepository.list("account-a")).toHaveLength(2);
    expect(await repositories.outboxRepository.list("account-b")).toHaveLength(1);
  });

  it("continues from known closed authority without reopening its server Session", async () => {
    const repositories = await inMemoryReaderRepositories();
    const closedState = readerState(serverSession("closed"));
    closedState.annotationRevision = 7;
    closedState.progress = {
      cfi: "epubcfi(/6/4)",
      percentage: 20,
      locationLabel: "020% - Chapter",
    };
    await repositories.stateRepository.putBookState(closedState);

    const result = await ensure("account-a", "book-1", repositories, () => "continuation");

    expect(result.selection).toBe("created-provisional");
    expect(result.state.session.serverSessionId).toBeNull();
    expect(result.state.session.localSessionId).toBe("local:continuation");
    expect(result.state.progress).toEqual(closedState.progress);
    expect(result.state.annotationRevision).toBe(7);
    expect(await repositories.outboxRepository.list("account-a")).toEqual([
      { type: "establish-session", namespaceKey: "account-a", bookId: "book-1" },
    ]);
  });

  it("retains provisional identity across IndexedDB close and reopen", async () => {
    const indexedDb = new IDBFactory();
    const options = { indexedDb, databaseName: "offline-reader-continuity-reopen" };
    const firstRepositories = await openIndexedDbOfflineRepositories(options);

    const first = await loadOrCreateOfflineReaderContinuity({
      namespaceKey: "account-a",
      bookId: "book-1",
      stateRepository: firstRepositories.readerState,
      outboxRepository: firstRepositories.readerOutbox,
      generateLocalId: () => "persistent-id",
    });
    firstRepositories.close();

    const reopened = await openIndexedDbOfflineRepositories(options);
    const generateUnexpectedId = vi.fn(() => "unexpected");
    const second = await loadOrCreateOfflineReaderContinuity({
      namespaceKey: "account-a",
      bookId: "book-1",
      stateRepository: reopened.readerState,
      outboxRepository: reopened.readerOutbox,
      generateLocalId: generateUnexpectedId,
    });

    expect(second.state.session).toEqual(first.state.session);
    expect(generateUnexpectedId).not.toHaveBeenCalled();
    expect(await reopened.readerOutbox.list("account-a")).toHaveLength(1);
    reopened.close();
  });
});

type ReaderRepositories = {
  stateRepository: OfflineReaderStateRepository;
  outboxRepository: ReaderOutboxRepository;
};

async function inMemoryReaderRepositories(): Promise<ReaderRepositories> {
  const factories = createInMemoryOfflineRepositoryFactories();
  return {
    stateRepository: await factories.createReaderStateRepository(),
    outboxRepository: await factories.createReaderOutboxRepository(),
  };
}

function ensure(
  namespaceKey: string,
  bookId: string,
  repositories: ReaderRepositories,
  generateLocalId: () => string,
) {
  return loadOrCreateOfflineReaderContinuity({
    namespaceKey,
    bookId,
    ...repositories,
    generateLocalId,
  });
}

function serverSession(
  status: "active" | "closed" | null,
): OfflineReaderSession {
  return {
    kind: "server-confirmed",
    localSessionId: "local:confirmed-state",
    serverSessionId: "server-session-1",
    lastKnownServerStatus: status,
  };
}

function readerState(session: OfflineReaderSession): OfflineReaderBookState {
  return {
    annotationRevision: 0,
    namespaceKey: "account-a",
    bookId: "book-1",
    schemaVersion: 1,
    session,
    progress: null,
    annotations: [],
  };
}
