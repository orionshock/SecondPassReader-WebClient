import type { MarginaliaAnnotation, MarginaliaSession } from "@secondpass/client";
import { describe, expect, it } from "vitest";
import { establishOnlineReaderOfflineHandoff } from "../../../app/offline/reader/continuity/OnlineReaderOfflineHandoff.Actions";
import type { OfflineReaderBookState } from "../../../app/offline/storage/OfflineRepositories.Types";
import { OfflineCurrentSessionAnnotationController } from "../../../features/reader/session/annotations/OfflineCurrentSessionAnnotation.Controller";
import { OfflineReadingProgressController } from "../../../features/reader/session/progress/OfflineReadingProgress.Controller";
import { createInMemoryOfflineRepositoryFactories } from "../../offline/storage/OfflineRepositoryTest.Fixtures";

describe("online Reader offline handoff", () => {
  it("seeds confirmed authority and uses the normal local progress and annotation outbox", async () => {
    const { stateRepository, outboxRepository, publicationAssets } = await repositories();
    const result = await establishOnlineReaderOfflineHandoff({
      namespaceKey: "account-a",
      bookId: "book-1",
      session: activeSession(),
      annotations: [bookmark("bookmark-1")],
      progress: { cfi: "epubcfi(/6/8)", percentage: 40, locationLabel: "040% - Chapter" },
      stateRepository,
      outboxRepository,
      generateLocalId: () => "handoff",
    });

    expect(result.state.session).toEqual({
      kind: "server-confirmed",
      localSessionId: "local:handoff",
      serverSessionId: "session-1",
      lastKnownServerStatus: "active",
    });
    expect(result.state.annotations[0]).toMatchObject({
      status: "present",
      origin: { kind: "server-confirmed", serverSessionId: "session-1" },
      annotation: { clientId: "bookmark-1" },
    });
    expect(await outboxRepository.list("account-a")).toEqual([]);

    const progress = new OfflineReadingProgressController({
      initialState: result.state,
      stateRepository,
      outboxRepository,
      delayMs: 0,
    });
    progress.update({ cfi: "epubcfi(/6/10)", percentage: 50, locationLabel: "050% - Chapter" });
    await progress.flushNow();

    const annotations = new OfflineCurrentSessionAnnotationController({
      initialState: (await stateRepository.getBookState("account-a", "book-1"))!,
      stateRepository,
      outboxRepository,
      generateClientId: () => "highlight-2",
    });
    await annotations.createHighlight({
      selection: { cfiRange: "epubcfi(/6/12,/1:0,/1:4)", text: "text" },
      color: "yellow",
    });

    expect(await outboxRepository.list("account-a")).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "replace-progress", serverSessionId: "session-1" }),
      expect.objectContaining({ type: "upsert-annotation", serverSessionId: "session-1" }),
    ]));
    expect(await publicationAssets.list("account-a")).toEqual([]);
  });

  it("preserves durable desired progress, annotation tombstones, and client identity", async () => {
    const { stateRepository, outboxRepository } = await repositories();
    const existing = existingState();
    await stateRepository.putBookState(existing);
    await outboxRepository.upsertIntent({
      type: "replace-progress",
      namespaceKey: "account-a",
      bookId: "book-1",
      serverSessionId: "session-1",
      intentRevision: 3,
      progress: existing.progress!,
    });
    await outboxRepository.upsertIntent({
      type: "delete-annotation",
      namespaceKey: "account-a",
      bookId: "book-1",
      serverSessionId: "session-1",
      intentRevision: 2,
      origin: { kind: "server-confirmed", serverSessionId: "session-1" },
      clientId: "bookmark-1",
    });

    const result = await establishOnlineReaderOfflineHandoff({
      namespaceKey: "account-a",
      bookId: "book-1",
      session: activeSession(),
      annotations: [bookmark("bookmark-1"), bookmark("bookmark-server")],
      progress: { cfi: "epubcfi(/6/2)", percentage: 10, locationLabel: "010% - Chapter" },
      stateRepository,
      outboxRepository,
    });

    expect(result.preserveExistingProgress).toBe(true);
    expect(result.state.progress).toEqual(existing.progress);
    expect(result.state.session.localSessionId).toBe("local:existing");
    expect(result.state.annotations).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "deleted", clientId: "bookmark-1" }),
      expect.objectContaining({ status: "present", annotation: expect.objectContaining({ clientId: "bookmark-server" }) }),
    ]));
  });

  it("keeps a confirmed closed Reading Session non-writable", async () => {
    const { stateRepository, outboxRepository } = await repositories();
    const result = await establishOnlineReaderOfflineHandoff({
      namespaceKey: "account-a",
      bookId: "book-1",
      session: { ...activeSession(), status: "closed", closedAt: "2026-09-12T00:00:00Z" },
      annotations: [],
      progress: null,
      stateRepository,
      outboxRepository,
      generateLocalId: () => "closed",
    });

    const controller = new OfflineCurrentSessionAnnotationController({
      initialState: result.state,
      stateRepository,
      outboxRepository,
    });
    expect(controller.canMutate()).toBe(false);
  });

  it("does not enqueue progress already acknowledged by the server bootstrap", async () => {
    const { stateRepository, outboxRepository } = await repositories();
    const session = activeSession();
    session.progress = {
      cfi: "epubcfi(/6/8)",
      locationLabel: "040% - Chapter",
      updatedAt: "2026-09-12T00:00:00Z",
    };
    const result = await establishOnlineReaderOfflineHandoff({
      namespaceKey: "account-a",
      bookId: "book-1",
      session,
      annotations: [],
      progress: { cfi: "epubcfi(/6/8)", percentage: 40, locationLabel: "040% - Chapter" },
      stateRepository,
      outboxRepository,
      generateLocalId: () => "acknowledged",
    });

    expect(result.suppressInitialProgressWrite).toBe(true);
    expect(await outboxRepository.list("account-a")).toEqual([]);
  });
});

async function repositories() {
  const factories = createInMemoryOfflineRepositoryFactories();
  return {
    stateRepository: await factories.createReaderStateRepository(),
    outboxRepository: await factories.createReaderOutboxRepository(),
    publicationAssets: await factories.createPublicationAssetRepository(),
  };
}

function activeSession(): MarginaliaSession {
  return {
    id: "session-1",
    name: "Reading Session",
    notes: "",
    status: "active",
    startedAt: "2026-09-12T00:00:00Z",
    closedAt: null,
    updatedAt: "2026-09-12T00:00:00Z",
    lastActivityAt: "2026-09-12T00:00:00Z",
    annotationCount: 1,
    progress: null,
  };
}

function bookmark(clientId: string): MarginaliaAnnotation {
  return {
    id: `server:${clientId}`,
    clientId,
    kind: "bookmark",
    location: { cfi: "epubcfi(/6/4)", locationLabel: "020% - Chapter" },
    createdAt: "2026-09-12T00:00:00Z",
    updatedAt: "2026-09-12T00:00:00Z",
  };
}

function existingState(): OfflineReaderBookState {
  return {
    namespaceKey: "account-a",
    bookId: "book-1",
    schemaVersion: 1,
    session: {
      kind: "server-confirmed",
      localSessionId: "local:existing",
      serverSessionId: "session-1",
      lastKnownServerStatus: "active",
    },
    progress: { cfi: "epubcfi(/6/20)", percentage: 90, locationLabel: "090% - Chapter" },
    annotations: [{
      status: "deleted",
      origin: { kind: "server-confirmed", serverSessionId: "session-1" },
      clientId: "bookmark-1",
    }],
  };
}
