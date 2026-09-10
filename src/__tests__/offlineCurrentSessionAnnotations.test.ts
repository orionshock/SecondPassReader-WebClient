import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import type { MarginaliaAnnotation } from "@secondpass/client";
import { openIndexedDbOfflineRepositories } from "../app/offline/IndexedDbOfflineRepositories.Factory";
import type {
  OfflineReaderBookState,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "../app/offline/OfflineRepositories.Types";
import { OfflineCurrentSessionAnnotationController } from "../features/reader/session/annotations/OfflineCurrentSessionAnnotation.Controller";
import { OfflineReadingProgressController } from "../features/reader/session/progress/OfflineReadingProgress.Controller";
import { createInMemoryOfflineRepositoryFactories } from "./OfflineRepositoryTest.Fixtures";

describe("offline current-session annotations", () => {
  it("shows and durably stores a highlight before any server delivery exists", async () => {
    const repositories = await inMemoryRepositories();
    const visible = vi.fn();
    const controller = controllerFor(repositories, initialState(), visible);

    await controller.createHighlight({
      selection: { cfiRange: "epubcfi(/6/4)", text: " Selected   text ", quotePrefix: "Before", quoteSuffix: "After" },
      color: "blue",
      note: "My note",
      locationLabel: "010% - Chapter",
    });

    expect(visible).toHaveBeenCalledWith([expect.objectContaining({
      clientId: "annotation-1",
      kind: "highlight",
      body: expect.objectContaining({ text: "Selected text", note: "My note", color: "blue" }),
    })]);
    expect((await repositories.stateRepository.getBookState("account-a", "book-1"))?.annotations)
      .toEqual([expect.objectContaining({ status: "present", origin: { kind: "local-unconfirmed" } })]);
    expect(await repositories.outboxRepository.list("account-a")).toEqual([
      expect.objectContaining({ type: "upsert-annotation", serverSessionId: null, intentRevision: 1 }),
    ]);
  });

  it("creates a body-free bookmark with one stable client ID", async () => {
    const repositories = await inMemoryRepositories();
    const generateClientId = vi.fn(() => "bookmark-1");
    const controller = controllerFor(repositories, initialState(), undefined, generateClientId);

    await expect(controller.toggleBookmark({
      location: { cfi: "epubcfi(/6/8)", bookProgress: 0.2 },
      locationLabel: "020% - Chapter",
      currentBookmark: null,
    })).resolves.toEqual({ ok: true, action: "created" });

    const [intent] = await repositories.outboxRepository.list("account-a");
    expect(intent).toMatchObject({
      type: "upsert-annotation",
      annotation: { clientId: "bookmark-1", kind: "bookmark" },
    });
    expect(JSON.stringify(intent)).not.toContain("body");
    expect(generateClientId).toHaveBeenCalledOnce();
  });

  it("preserves client ID and exact-CFI update behavior across edits", async () => {
    const repositories = await inMemoryRepositories();
    const generateClientId = vi.fn(() => "highlight-1");
    const controller = controllerFor(repositories, initialState(), undefined, generateClientId);
    const selection = { cfiRange: "epubcfi(/6/4)", text: "Original text" };

    await controller.createHighlight({ selection, color: "yellow", note: "one" });
    await controller.createHighlight({ selection: { ...selection, text: "ignored replacement quote" }, color: "green", note: "two" });
    await controller.updateHighlight("local:highlight-1", { color: "blue", note: "three" });

    const state = await repositories.stateRepository.getBookState("account-a", "book-1");
    expect(state?.annotations).toHaveLength(1);
    expect(state?.annotations[0]).toMatchObject({
      annotation: { clientId: "highlight-1", body: { text: "Original text", color: "blue", note: "three" } },
    });
    const intents = await repositories.outboxRepository.list("account-a");
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      type: "upsert-annotation",
      intentRevision: 3,
      annotation: { clientId: "highlight-1", body: { note: "three" } },
    });
    expect(generateClientId).toHaveBeenCalledOnce();
  });

  it("removes an unconfirmed create and its delivery intent", async () => {
    const repositories = await inMemoryRepositories();
    const controller = controllerFor(repositories);
    await controller.createHighlight({
      selection: { cfiRange: "epubcfi(/6/4)", text: "Text" },
      color: "yellow",
    });

    await controller.removeById("local:annotation-1");

    expect((await repositories.stateRepository.getBookState("account-a", "book-1"))?.annotations).toEqual([]);
    expect(await repositories.outboxRepository.list("account-a")).toEqual([]);
  });

  it("turns a confirmed edit into one confirmed delete and allows restore as latest upsert", async () => {
    const repositories = await inMemoryRepositories();
    const state = confirmedState();
    await repositories.stateRepository.putBookState(state);
    const controller = controllerFor(repositories, state);

    await controller.updateHighlight("local:confirmed-1", { color: "green", note: "edited" });
    await controller.removeById("local:confirmed-1");
    expect(await repositories.outboxRepository.list("account-a")).toEqual([
      expect.objectContaining({
        type: "delete-annotation",
        serverSessionId: "server-active",
        origin: { kind: "server-confirmed", serverSessionId: "server-active" },
        clientId: "confirmed-1",
      }),
    ]);
    expect(JSON.stringify(await repositories.outboxRepository.list("account-a")))
      .not.toContain("local:confirmed");
    expect(controller.getAnnotations()).toEqual([]);

    const restoredState = confirmedState();
    const restoredController = controllerFor(repositories, restoredState);
    await restoredController.updateHighlight("local:confirmed-1", { color: "blue", note: "restored" });
    expect(await repositories.outboxRepository.list("account-a")).toEqual([
      expect.objectContaining({ type: "upsert-annotation", annotation: expect.objectContaining({ clientId: "confirmed-1" }) }),
    ]);
  });

  it("refuses known-closed authority and never uses local Session identity as a server target", async () => {
    const repositories = await inMemoryRepositories();
    const state = initialState();
    state.session = {
      kind: "server-confirmed",
      localSessionId: "local:continuity-only",
      serverSessionId: "server-closed",
      lastKnownServerStatus: "closed",
    };
    const controller = controllerFor(repositories, state);

    await expect(controller.createHighlight({
      selection: { cfiRange: "epubcfi(/6/4)", text: "Text" },
      color: "yellow",
    })).rejects.toThrow("cannot be modified");
    expect(await repositories.outboxRepository.list("account-a")).toEqual([]);
    expect(JSON.stringify(await repositories.outboxRepository.list("account-a")))
      .not.toContain("local:continuity-only");
  });

  it("keeps the visible and durable projection when outbox persistence fails", async () => {
    const repositories = await inMemoryRepositories();
    repositories.outboxRepository.upsertIntent = vi.fn(async () => {
      throw new Error("secret storage details");
    });
    const visible = vi.fn();
    const controller = controllerFor(repositories, initialState(), visible);

    await expect(controller.createHighlight({
      selection: { cfiRange: "epubcfi(/6/4)", text: "Text" },
      color: "yellow",
    })).rejects.toThrow("Offline annotation was not saved.");

    expect(visible).toHaveBeenCalledWith([expect.objectContaining({ clientId: "annotation-1" })]);
    expect((await repositories.stateRepository.getBookState("account-a", "book-1"))?.annotations).toHaveLength(1);
    expect(controller.getState()).toEqual({ status: "error", dirty: true });
  });

  it("skips outbox persistence when Reader-state persistence fails", async () => {
    const repositories = await inMemoryRepositories();
    repositories.stateRepository.putBookState = vi.fn(async () => {
      throw new Error("quota details");
    });
    const upsert = vi.spyOn(repositories.outboxRepository, "upsertIntent");
    const controller = controllerFor(repositories);

    await expect(controller.createHighlight({
      selection: { cfiRange: "epubcfi(/6/4)", text: "Text" },
      color: "yellow",
    })).rejects.toThrow("Offline annotation was not saved.");
    expect(controller.getAnnotations()).toHaveLength(1);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("retains local annotations across an IndexedDB close and reopen", async () => {
    const indexedDb = new IDBFactory();
    const options = { indexedDb, databaseName: "offline-annotation-reopen" };
    const first = await openIndexedDbOfflineRepositories(options);
    const controller = new OfflineCurrentSessionAnnotationController({
      initialState: initialState(),
      stateRepository: first.readerState,
      outboxRepository: first.readerOutbox,
      generateClientId: () => "persisted-1",
    });
    await controller.createHighlight({
      selection: { cfiRange: "epubcfi(/6/4)", text: "Persistent text" },
      color: "yellow",
    });
    first.close();

    const reopened = await openIndexedDbOfflineRepositories(options);
    expect((await reopened.readerState.getBookState("account-a", "book-1"))?.annotations)
      .toEqual([expect.objectContaining({ annotation: expect.objectContaining({ clientId: "persisted-1" }) })]);
    reopened.close();
  });

  it("does not clobber progress when both local owners persist the same Book", async () => {
    const repositories = await inMemoryRepositories();
    const state = initialState();
    const annotations = controllerFor(repositories, state);
    const progress = new OfflineReadingProgressController({
      initialState: state,
      stateRepository: repositories.stateRepository,
      outboxRepository: repositories.outboxRepository,
    });
    progress.update({ cfi: "epubcfi(/6/10)", percentage: 40, locationLabel: "040% - Chapter" });

    await Promise.all([
      progress.flushNow(),
      annotations.createHighlight({
        selection: { cfiRange: "epubcfi(/6/4)", text: "Text" },
        color: "yellow",
      }),
    ]);

    const stored = await repositories.stateRepository.getBookState("account-a", "book-1");
    expect(stored?.progress?.cfi).toBe("epubcfi(/6/10)");
    expect(stored?.annotations).toHaveLength(1);
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

function controllerFor(
  repositories: Repositories,
  state = initialState(),
  onAnnotationsChange?: (annotations: MarginaliaAnnotation[]) => void,
  generateClientId = () => "annotation-1",
) {
  return new OfflineCurrentSessionAnnotationController({
    initialState: state,
    stateRepository: repositories.stateRepository,
    outboxRepository: repositories.outboxRepository,
    generateClientId,
    onAnnotationsChange,
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

function confirmedState(): OfflineReaderBookState {
  return {
    ...initialState(),
    session: {
      kind: "server-confirmed",
      localSessionId: "local:confirmed",
      serverSessionId: "server-active",
      lastKnownServerStatus: "active",
    },
    annotations: [{
      status: "present",
      origin: { kind: "server-confirmed", serverSessionId: "server-active" },
      annotation: {
        clientId: "confirmed-1",
        kind: "highlight",
        location: { cfi: "epubcfi(/6/4)", locationLabel: "010% - Chapter" },
        body: { text: "Original", prefix: "", suffix: "", color: "yellow", note: "" },
      },
    }],
  };
}
