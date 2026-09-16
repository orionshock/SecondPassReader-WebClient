import { describe, expect, it, vi } from "vitest";
import {
  createOfflineReaderProgressPersistence,
  type OfflineReadingProgress,
} from "../../../../app/offline/reader/progress/OfflineReaderProgressPersistence.Actions";
import type {
  OfflineReaderBookState,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "../../../../app/offline/storage/OfflineRepositories.Types";
import { createInMemoryReaderRepositories } from "../../storage/OfflineRepositoryTest.Fixtures";
import { readerIntentResourceKey } from "../../../../app/offline/reader/outbox/ReaderOutbox.Policy";

describe("offline Reader progress persistence", () => {
  it("commits Reader progress before persisting its delivery intent", async () => {
    const repositories = await repositoriesWithState();
    const order: string[] = [];
    const update = repositories.stateRepository.updateBookState.bind(repositories.stateRepository);
    const upsert = repositories.outboxRepository.upsertIntent.bind(repositories.outboxRepository);
    repositories.stateRepository.updateBookState = async (...args) => {
      const result = await update(...args);
      order.push("state");
      return result;
    };
    repositories.outboxRepository.upsertIntent = async (intent) => {
      order.push("outbox");
      await upsert(intent);
    };

    await expect(persistence(repositories).persist(progress("epubcfi(/6/8)", 30)))
      .resolves.toEqual({ status: "persisted" });

    expect(order).toEqual(["state", "outbox"]);
    expect((await repositories.stateRepository.getBookState("account-a", "book-1"))?.progress)
      .toEqual(progress("epubcfi(/6/8)", 30));
    expect(await repositories.outboxRepository.list("account-a")).toEqual([
      expect.objectContaining({ type: "replace-progress", intentRevision: 1 }),
    ]);
  });

  it("reports state-only when outbox persistence fails and reconstructs delivery on retry", async () => {
    const repositories = await repositoriesWithState();
    const originalUpsert = repositories.outboxRepository.upsertIntent.bind(repositories.outboxRepository);
    repositories.outboxRepository.upsertIntent = vi.fn(async () => {
      throw new Error("outbox unavailable");
    });
    const owner = persistence(repositories);
    const desired = progress("epubcfi(/6/10)", 40);

    await expect(owner.persist(desired)).resolves.toEqual({ status: "state-only" });
    expect((await repositories.stateRepository.getBookState("account-a", "book-1"))?.progress).toEqual(desired);
    expect(await repositories.outboxRepository.list("account-a")).toEqual([]);

    repositories.outboxRepository.upsertIntent = originalUpsert;
    await expect(owner.persist(desired)).resolves.toEqual({ status: "persisted" });
    expect(await repositories.outboxRepository.list("account-a")).toEqual([
      expect.objectContaining({ progress: desired, intentRevision: 1 }),
    ]);
  });

  it("does not touch the outbox when Reader-state persistence fails", async () => {
    const repositories = await repositoriesWithState();
    repositories.stateRepository.updateBookState = vi.fn(async () => {
      throw new Error("state unavailable");
    });
    const list = vi.spyOn(repositories.outboxRepository, "list");
    const upsert = vi.spyOn(repositories.outboxRepository, "upsertIntent");

    await expect(persistence(repositories).persist(progress("epubcfi(/6/8)", 30)))
      .resolves.toEqual({ status: "failed" });

    expect(list).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns missing without recreating continuity or writing an intent", async () => {
    const repositories = await repositoriesWithState();
    await repositories.stateRepository.deleteBookState("account-a", "book-1");
    const upsert = vi.spyOn(repositories.outboxRepository, "upsertIntent");

    await expect(persistence(repositories).persist(progress("epubcfi(/6/8)", 30)))
      .resolves.toEqual({ status: "missing" });

    expect(await repositories.stateRepository.getBookState("account-a", "book-1")).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("coalesces latest desired progress, advances revision, and clears obsolete attempt metadata", async () => {
    const repositories = await repositoriesWithState();
    await repositories.outboxRepository.upsertIntent({
      type: "replace-progress",
      namespaceKey: "account-a",
      bookId: "book-1",
      serverSessionId: null,
      intentRevision: 4,
      progress: progress("epubcfi(/6/2)", 10),
    });
    await repositories.outboxRepository.recordAttempt("account-a", progressResourceKey(), 4, {
      revision: 4,
      classification: "retry-later",
      attemptCount: 2,
      attemptedAt: 10,
      retryEligibleAt: 20,
    });
    const desired = progress("epubcfi(/6/12)", 60);

    await expect(persistence(repositories).persist(desired)).resolves.toEqual({ status: "persisted" });

    const intents = await repositories.outboxRepository.list("account-a");
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      type: "replace-progress",
      intentRevision: 5,
      progress: desired,
    });
    expect(intents[0]).not.toHaveProperty("attempt");
  });

  it("advances revision after an unobserved committed outbox write", async () => {
    const repositories = await repositoriesWithState();
    const originalUpsert = repositories.outboxRepository.upsertIntent.bind(repositories.outboxRepository);
    repositories.outboxRepository.upsertIntent = vi.fn(async (intent) => {
      await originalUpsert(intent);
      throw new Error("completion not observed");
    });
    const owner = persistence(repositories);
    const desired = progress("epubcfi(/6/14)", 70);

    await expect(owner.persist(desired)).resolves.toEqual({ status: "state-only" });
    repositories.outboxRepository.upsertIntent = originalUpsert;
    await expect(owner.persist(desired)).resolves.toEqual({ status: "persisted" });

    expect(await repositories.outboxRepository.list("account-a")).toEqual([
      expect.objectContaining({ intentRevision: 2, progress: desired }),
    ]);
  });
});

type Repositories = {
  stateRepository: OfflineReaderStateRepository;
  outboxRepository: ReaderOutboxRepository;
};

async function repositoriesWithState(): Promise<Repositories> {
  const repositories = createInMemoryReaderRepositories();
  await repositories.stateRepository.putBookState(initialState());
  return repositories;
}

function persistence(repositories: Repositories) {
  return createOfflineReaderProgressPersistence({
    namespaceKey: "account-a",
    bookId: "book-1",
    stateRepository: repositories.stateRepository,
    outboxRepository: repositories.outboxRepository,
  });
}

function initialState(): OfflineReaderBookState {
  return {
    annotationRevision: 0,
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

function progress(cfi: string, percentage: number): OfflineReadingProgress {
  return { cfi, percentage, locationLabel: `${String(percentage).padStart(3, "0")}% - Location` };
}

function progressResourceKey(): string {
  return readerIntentResourceKey({
    type: "replace-progress",
    namespaceKey: "account-a",
    bookId: "book-1",
    serverSessionId: null,
    intentRevision: 0,
    progress: progress("epubcfi(/6/2)", 10),
  });
}
