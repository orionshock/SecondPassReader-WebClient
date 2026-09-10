import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openIndexedDbOfflineRepositories } from "../../../app/offline/storage/IndexedDbOfflineRepositories.Factory";
import type {
  OfflineReaderBookState,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "../../../app/offline/storage/OfflineRepositories.Types";
import {
  buildOfflineReadingProgress,
  OfflineReadingProgressController,
} from "../../../features/reader/session/progress/OfflineReadingProgress.Controller";
import { settleOfflineProgressExit } from "../../../features/reader/session/progress/OfflineReadingProgress.Lifecycle";
import { createInMemoryOfflineRepositoryFactories } from "../../offline/storage/OfflineRepositoryTest.Fixtures";

describe("offline reading progress shape", () => {
  it("persists canonical CFI, integer percentage, and the stable percent-first label", () => {
    expect(buildOfflineReadingProgress({
      bookTitle: "Book",
      toc: [{ id: "chapter", label: "Chapter One", href: "chapter.xhtml" }],
      location: {
        cfi: "  epubcfi(/6/4)  ",
        href: "chapter.xhtml",
        bookProgress: 0.126,
      },
    })).toEqual({
      cfi: "epubcfi(/6/4)",
      percentage: 13,
      locationLabel: "013% - Chapter One",
    });
  });
});

describe("offline reading progress durability", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounces relocation churn and retains only the latest state and outbox intent", async () => {
    const repositories = await inMemoryRepositories();
    const controller = controllerFor(repositories);

    controller.update(progress("epubcfi(/6/2)", 10));
    controller.update(progress("epubcfi(/6/4)", 20));
    controller.update(progress("epubcfi(/6/8)", 30));
    await vi.advanceTimersByTimeAsync(749);
    expect(await repositories.stateRepository.getBookState("account-a", "book-1")).toBeNull();
    await vi.advanceTimersByTimeAsync(1);

    expect((await repositories.stateRepository.getBookState("account-a", "book-1"))?.progress)
      .toEqual(progress("epubcfi(/6/8)", 30));
    expect(await repositories.outboxRepository.list("account-a")).toEqual([
      expect.objectContaining({
        type: "replace-progress",
        serverSessionId: null,
        progress: progress("epubcfi(/6/8)", 30),
      }),
    ]);
  });

  it("replaces committed progress without comparing CFI order", async () => {
    const repositories = await inMemoryRepositories();
    const controller = controllerFor(repositories);
    controller.update(progress("epubcfi(/99)", 90));
    await controller.flushNow();
    controller.update(progress("epubcfi(/2)", 5));
    await controller.flushNow();

    expect((await repositories.stateRepository.getBookState("account-a", "book-1"))?.progress)
      .toEqual(progress("epubcfi(/2)", 5));
    const intents = await repositories.outboxRepository.list("account-a");
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      type: "replace-progress",
      intentRevision: 2,
      progress: progress("epubcfi(/2)", 5),
    });
  });

  it("writes Reader state before outbox intent and retains progress when outbox storage fails", async () => {
    const repositories = await inMemoryRepositories();
    const originalUpsert = repositories.outboxRepository.upsertIntent;
    repositories.outboxRepository.upsertIntent = vi.fn(async () => {
      throw new Error("private IndexedDB detail");
    });
    const controller = controllerFor(repositories);

    controller.update(progress("epubcfi(/6/8)", 30));
    await controller.flushNow();

    expect((await repositories.stateRepository.getBookState("account-a", "book-1"))?.progress)
      .toEqual(progress("epubcfi(/6/8)", 30));
    expect(controller.getState()).toEqual({ status: "error", dirty: true });

    repositories.outboxRepository.upsertIntent = originalUpsert;
    await controller.flushNow();
    expect(await repositories.outboxRepository.list("account-a")).toHaveLength(1);
  });

  it("does not create delivery intent when the durable state write fails", async () => {
    const repositories = await inMemoryRepositories();
    repositories.stateRepository.putBookState = vi.fn(async () => {
      throw new Error("quota detail");
    });
    const controller = controllerFor(repositories);

    controller.update(progress("epubcfi(/6/8)", 30));
    await expect(controller.flushNow()).resolves.toBeUndefined();

    expect(await repositories.outboxRepository.list("account-a")).toEqual([]);
    expect(controller.getState()).toEqual({ status: "error", dirty: true });
  });

  it("refuses progress writes for remembered closed Session authority", async () => {
    const repositories = await inMemoryRepositories();
    const closedState = initialState();
    closedState.session = {
      kind: "server-confirmed",
      localSessionId: "local:closed",
      serverSessionId: "server-closed",
      lastKnownServerStatus: "closed",
    };
    await repositories.stateRepository.putBookState(closedState);
    const controller = new OfflineReadingProgressController({
      initialState: closedState,
      stateRepository: repositories.stateRepository,
      outboxRepository: repositories.outboxRepository,
    });

    controller.update(progress("epubcfi(/6/8)", 30));
    await controller.flushNow();

    expect((await repositories.stateRepository.getBookState("account-a", "book-1"))?.progress).toBeNull();
    expect(await repositories.outboxRepository.list("account-a")).toEqual([]);
  });

  it("targets remembered active server authority without using the local Session identity", async () => {
    const repositories = await inMemoryRepositories();
    const activeState = initialState();
    activeState.session = {
      kind: "server-confirmed",
      localSessionId: "local:continuity-only",
      serverSessionId: "server-active",
      lastKnownServerStatus: "active",
    };
    await repositories.stateRepository.putBookState(activeState);
    const controller = new OfflineReadingProgressController({
      initialState: activeState,
      stateRepository: repositories.stateRepository,
      outboxRepository: repositories.outboxRepository,
    });

    controller.update(progress("epubcfi(/6/8)", 30));
    await controller.flushNow();

    expect(await repositories.outboxRepository.list("account-a")).toEqual([
      expect.objectContaining({
        type: "replace-progress",
        serverSessionId: "server-active",
      }),
    ]);
    expect(JSON.stringify(await repositories.outboxRepository.list("account-a")))
      .not.toContain("local:continuity-only");
  });

  it("flushes the latest pending candidate during bounded Reader teardown", async () => {
    const repositories = await inMemoryRepositories();
    const controller = controllerFor(repositories);
    controller.update(progress("epubcfi(/6/2)", 10));
    controller.update(progress("epubcfi(/6/10)", 40));

    await settleOfflineProgressExit(controller, 100);

    expect((await repositories.stateRepository.getBookState("account-a", "book-1"))?.progress)
      .toEqual(progress("epubcfi(/6/10)", 40));
  });

  it("survives IndexedDB close and reopen", async () => {
    vi.useRealTimers();
    const indexedDb = new IDBFactory();
    const options = { indexedDb, databaseName: "offline-progress-reopen" };
    const first = await openIndexedDbOfflineRepositories(options);
    const controller = new OfflineReadingProgressController({
      initialState: initialState(),
      stateRepository: first.readerState,
      outboxRepository: first.readerOutbox,
    });
    controller.update(progress("epubcfi(/6/12)", 60));
    await controller.flushNow();
    first.close();

    const reopened = await openIndexedDbOfflineRepositories(options);
    expect((await reopened.readerState.getBookState("account-a", "book-1"))?.progress)
      .toEqual(progress("epubcfi(/6/12)", 60));
    expect(await reopened.readerOutbox.list("account-a")).toEqual([
      expect.objectContaining({ type: "replace-progress", serverSessionId: null }),
    ]);
    reopened.close();
  });
});

type Repositories = {
  stateRepository: OfflineReaderStateRepository;
  outboxRepository: ReaderOutboxRepository;
};

async function inMemoryRepositories(): Promise<Repositories> {
  const factories = createInMemoryOfflineRepositoryFactories();
  return {
    stateRepository: await factories.createReaderStateRepository(),
    outboxRepository: await factories.createReaderOutboxRepository(),
  };
}

function controllerFor(repositories: Repositories) {
  return new OfflineReadingProgressController({
    initialState: initialState(),
    stateRepository: repositories.stateRepository,
    outboxRepository: repositories.outboxRepository,
  });
}

function initialState(): OfflineReaderBookState {
  return {
    namespaceKey: "account-a",
    bookId: "book-1",
    schemaVersion: 1,
    session: {
      kind: "provisional",
      localSessionId: "local:reader",
      serverSessionId: null,
      lastKnownServerStatus: null,
    },
    progress: null,
    annotations: [],
  };
}

function progress(cfi: string, percentage: number) {
  return { cfi, percentage, locationLabel: `${String(percentage).padStart(3, "0")}% - Location` };
}
