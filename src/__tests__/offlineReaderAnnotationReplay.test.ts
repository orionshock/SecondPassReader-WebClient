import { ApiError } from "@secondpass/client";
import { IDBFactory } from "fake-indexeddb";
import type {
  MarginaliaAnnotation,
  MarginaliaAnnotationBatchOperation,
  MarginaliaBootstrap,
  MarginaliaSession,
} from "@secondpass/client";
import { describe, expect, it, vi } from "vitest";
import {
  replayOfflineReaderAnnotations,
  type ReaderAnnotationReplayClient,
} from "../app/offline/OfflineReaderAnnotationReplay.Actions";
import { openIndexedDbOfflineRepositories } from "../app/offline/IndexedDbOfflineRepositories.Factory";
import type {
  OfflineReaderBookState,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "../app/offline/OfflineRepositories.Types";
import type {
  ReaderAnnotationOrigin,
  ReaderOutboxIntent,
  UpsertReaderAnnotationIntent,
} from "../app/offline/ReaderOutbox.Policy";
import { createInMemoryOfflineRepositoryFactories } from "./OfflineRepositoryTest.Fixtures";

describe("offline Reader annotation replay", () => {
  it("sends complete upsert and delete intent in one batch and adopts the authoritative collection", async () => {
    const repositories = await repositoriesWithState(readerState("session-1"));
    const upsert = highlightIntent("local-1", 1, { kind: "local-unconfirmed" });
    const deleted = deleteIntent("confirmed-2", 4, { kind: "server-confirmed", serverSessionId: "session-1" });
    const progress = progressIntent();
    await putIntents(repositories.outboxRepository, [upsert, deleted, progress]);
    const response = [serverHighlight("local-1", "Server canonical note"), serverBookmark("server-only")];
    const client = replayClient(response);

    const result = await replay(client, repositories, "session-1");

    expect(client.marginalia.sessions.batchAnnotations).toHaveBeenCalledWith("session-1", [
      { action: "delete", clientId: "confirmed-2" },
      { action: "upsert", annotation: upsert.annotation },
    ]);
    expect(result).toEqual({
      status: "replayed",
      delivered: 2,
      acknowledged: 2,
      remaining: 0,
      continuation: null,
    });
    const stored = await repositories.stateRepository.getBookState("account-a", "book-1");
    expect(stored?.annotations).toEqual([
      expect.objectContaining({
        status: "present",
        origin: { kind: "server-confirmed", serverSessionId: "session-1" },
        annotation: expect.objectContaining({ clientId: "local-1", body: expect.objectContaining({ note: "Server canonical note" }) }),
      }),
      expect.objectContaining({ annotation: expect.objectContaining({ clientId: "server-only", kind: "bookmark" }) }),
    ]);
    expect(await repositories.outboxRepository.list("account-a")).toEqual([progress]);
  });

  it("uses the existing client ID for a confirmed edit while its Session remains active", async () => {
    const state = readerState("session-1");
    const intent = highlightIntent("confirmed-1", 2, { kind: "server-confirmed", serverSessionId: "session-1" });
    state.annotations = [projection(intent)];
    const repositories = await repositoriesWithState(state);
    await repositories.outboxRepository.upsertIntent(intent);
    const client = replayClient([serverHighlight("confirmed-1", "edited")]);

    await replay(client, repositories, "session-1");

    expect(batchOperations(client)).toEqual([
      expect.objectContaining({ action: "upsert", annotation: expect.objectContaining({ clientId: "confirmed-1" }) }),
    ]);
  });

  it("removes stale confirmed projection absent from the complete authoritative response", async () => {
    const delivered = highlightIntent("local-1", 1, { kind: "local-unconfirmed" });
    const stale = highlightIntent(
      "stale-server-annotation",
      1,
      { kind: "server-confirmed", serverSessionId: "session-1" },
    );
    const state = readerState("session-1");
    state.annotations = [projection(stale), projection(delivered)];
    const repositories = await repositoriesWithState(state);
    await repositories.outboxRepository.upsertIntent(delivered);

    await replay(replayClient([serverHighlight("local-1", "note")]), repositories, "session-1");

    expect((await repositories.stateRepository.getBookState("account-a", "book-1"))?.annotations)
      .toEqual([expect.objectContaining({ annotation: expect.objectContaining({ clientId: "local-1" }) })]);
  });

  it("does not acknowledge or hide a newer edit created while the request is in flight", async () => {
    const first = highlightIntent("local-1", 1, { kind: "local-unconfirmed" }, "first");
    const state = readerState("session-1");
    state.annotations = [projection(first)];
    const repositories = await repositoriesWithState(state);
    await repositories.outboxRepository.upsertIntent(first);
    let resolveBatch!: (value: { annotations: MarginaliaAnnotation[] }) => void;
    const response = new Promise<{ annotations: MarginaliaAnnotation[] }>((resolve) => { resolveBatch = resolve; });
    const client = replayClient([]);
    vi.mocked(client.marginalia.sessions.batchAnnotations).mockReturnValue(response);

    const replaying = replay(client, repositories, "session-1");
    await waitFor(() => vi.mocked(client.marginalia.sessions.batchAnnotations).mock.calls.length === 1);
    const newer = highlightIntent("local-1", 2, { kind: "local-unconfirmed" }, "newer");
    const newerState = (await repositories.stateRepository.getBookState("account-a", "book-1"))!;
    newerState.annotations = [projection(newer)];
    await repositories.stateRepository.putBookState(newerState);
    await repositories.outboxRepository.upsertIntent(newer);
    resolveBatch({ annotations: [serverHighlight("local-1", "first")] });

    const result = await replaying;

    expect(result).toMatchObject({ status: "replayed", acknowledged: 0, remaining: 1 });
    expect(await repositories.outboxRepository.list("account-a")).toEqual([newer]);
    expect((await repositories.stateRepository.getBookState("account-a", "book-1"))?.annotations)
      .toEqual([expect.objectContaining({ annotation: expect.objectContaining({ body: expect.objectContaining({ note: "newer" }) }) })]);
  });

  it.each([
    { error: new TypeError("Failed to fetch https://secret.invalid"), expected: { status: "retry-later", retryAfterMs: null } },
    { error: apiError(503), expected: { status: "retry-later", retryAfterMs: null } },
    { error: apiError(401), expected: { status: "reauthenticate" } },
    { error: apiError(403), expected: { status: "refresh-authority" } },
    { error: apiError(404), expected: { status: "refresh-authority" } },
    { error: apiError(400), expected: { status: "terminal-request" } },
  ])("retains authored state and intent for normalized delivery failure", async ({ error, expected }) => {
    const intent = highlightIntent("local-1", 1, { kind: "local-unconfirmed" });
    const state = readerState("session-1");
    state.annotations = [projection(intent)];
    const repositories = await repositoriesWithState(state);
    await repositories.outboxRepository.upsertIntent(intent);
    const client = replayClient([]);
    vi.mocked(client.marginalia.sessions.batchAnnotations).mockRejectedValue(error);

    const result = await replay(client, repositories, "session-1");

    expect(result).toEqual(expected);
    expect(await repositories.outboxRepository.list("account-a")).toEqual([{
      ...intent,
      attempt: expect.objectContaining({
        revision: intent.intentRevision,
        classification: expected.status === "terminal-request" ? "terminal-request" : expected.status,
        attemptCount: 1,
      }),
    }]);
    expect((await repositories.stateRepository.getBookState("account-a", "book-1"))?.annotations)
      .toEqual([projection(intent)]);
    expect(JSON.stringify(result)).not.toContain("secret.invalid");
  });

  it("continues eligible upserts after SESSION_CLOSED and drops confirmed deletes", async () => {
    const local = highlightIntent("local-1", 1, { kind: "local-unconfirmed" }, "local note", "session-old");
    const confirmed = highlightIntent(
      "confirmed-1",
      3,
      { kind: "server-confirmed", serverSessionId: "session-old" },
      "confirmed edit",
      "session-old",
    );
    const deleted = deleteIntent("confirmed-delete", 2, {
      kind: "server-confirmed",
      serverSessionId: "session-old",
    }, "session-old");
    const state = readerState("session-old");
    state.annotations = [projection(local), projection(confirmed), {
      status: "deleted",
      origin: deleted.origin,
      clientId: deleted.clientId,
    }];
    const repositories = await repositoriesWithState(state);
    await putIntents(repositories.outboxRepository, [local, confirmed, deleted]);
    const client = replayClient([]);
    vi.mocked(client.marginalia.sessions.batchAnnotations)
      .mockRejectedValueOnce(apiError(409, "SESSION_CLOSED"))
      .mockResolvedValueOnce({
        annotations: [serverHighlight("local-1", "local note"), serverHighlight("new-copy-1", "confirmed edit")],
      });
    vi.mocked(client.marginalia.books.getActiveSession).mockResolvedValue(activeBootstrap("session-new"));
    const generateClientId = vi.fn(() => "new-copy-1");

    const result = await replay(client, repositories, "session-old", generateClientId);

    expect(vi.mocked(client.marginalia.sessions.batchAnnotations).mock.calls.map(([sessionId]) => sessionId))
      .toEqual(["session-old", "session-new"]);
    expect(batchOperations(client, 1)).toEqual([
      expect.objectContaining({ action: "upsert", annotation: expect.objectContaining({ clientId: "local-1" }) }),
      expect.objectContaining({ action: "upsert", annotation: expect.objectContaining({ clientId: "new-copy-1" }) }),
    ]);
    expect(JSON.stringify(batchOperations(client, 1))).not.toContain("confirmed-delete");
    expect(generateClientId).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      status: "replayed",
      continuation: {
        forwardedConfirmedEdits: 1,
        droppedConfirmedDeletes: 1,
        continuedLocalUpserts: 1,
        fromSessionId: "session-old",
        toSessionId: "session-new",
      },
    });
    const finalState = await repositories.stateRepository.getBookState("account-a", "book-1");
    expect(finalState?.session).toMatchObject({ serverSessionId: "session-new" });
    expect(finalState?.annotations.map((item) => item.status === "present" ? item.annotation.clientId : item.clientId).sort())
      .toEqual(["local-1", "new-copy-1"]);
    expect(await repositories.outboxRepository.list("account-a")).toEqual([]);
  });

  it("persists continuation transformations when delivery to the new Session still fails", async () => {
    const confirmed = highlightIntent(
      "confirmed-1",
      3,
      { kind: "server-confirmed", serverSessionId: "session-old" },
      "confirmed edit",
      "session-old",
    );
    const state = readerState("session-old");
    state.annotations = [projection(confirmed)];
    const indexedDb = new IDBFactory();
    const options = { indexedDb, databaseName: "annotation-continuation-reopen" };
    const first = await openIndexedDbOfflineRepositories(options);
    const repositories = { stateRepository: first.readerState, outboxRepository: first.readerOutbox };
    await repositories.stateRepository.putBookState(state);
    await repositories.outboxRepository.upsertIntent(confirmed);
    const client = replayClient([]);
    vi.mocked(client.marginalia.sessions.batchAnnotations)
      .mockRejectedValueOnce(apiError(409, "SESSION_CLOSED"))
      .mockRejectedValueOnce(new TypeError("network"));
    vi.mocked(client.marginalia.books.getActiveSession).mockResolvedValue(activeBootstrap("session-new"));

    const result = await replay(client, repositories, "session-old", () => "new-copy-1");

    expect(result).toEqual({ status: "retry-later", retryAfterMs: null });
    first.close();
    const reopened = await openIndexedDbOfflineRepositories(options);
    expect(await reopened.readerOutbox.list("account-a")).toEqual([
      expect.objectContaining({
        type: "upsert-annotation",
        serverSessionId: "session-new",
        origin: { kind: "local-unconfirmed" },
        annotation: expect.objectContaining({ clientId: "new-copy-1", body: expect.objectContaining({ note: "confirmed edit" }) }),
      }),
    ]);
    expect((await reopened.readerState.getBookState("account-a", "book-1"))?.annotations)
      .toEqual([expect.objectContaining({ annotation: expect.objectContaining({ clientId: "new-copy-1" }) })]);
    reopened.close();
  });

  it("guards concurrent same-runtime replay and exposes no start-over operation", async () => {
    const intent = highlightIntent("local-1", 1, { kind: "local-unconfirmed" });
    const repositories = await repositoriesWithState(readerState("session-1"));
    await repositories.outboxRepository.upsertIntent(intent);
    let resolveBatch!: (value: { annotations: MarginaliaAnnotation[] }) => void;
    const pending = new Promise<{ annotations: MarginaliaAnnotation[] }>((resolve) => { resolveBatch = resolve; });
    const client = replayClient([]);
    vi.mocked(client.marginalia.sessions.batchAnnotations).mockReturnValue(pending);

    const first = replay(client, repositories, "session-1");
    const second = replay(client, repositories, "session-1");
    expect(first).toBe(second);
    resolveBatch({ annotations: [serverHighlight("local-1", "note")] });
    await Promise.all([first, second]);

    expect(client.marginalia.sessions.batchAnnotations).toHaveBeenCalledOnce();
    expect("startOver" in client.marginalia.books).toBe(false);
  });
});

type Repositories = {
  stateRepository: OfflineReaderStateRepository;
  outboxRepository: ReaderOutboxRepository;
};

async function repositoriesWithState(state: OfflineReaderBookState): Promise<Repositories> {
  const factories = createInMemoryOfflineRepositoryFactories();
  const repositories = {
    stateRepository: await factories.createReaderStateRepository(),
    outboxRepository: await factories.createReaderOutboxRepository(),
  };
  await repositories.stateRepository.putBookState(state);
  return repositories;
}

function replay(
  client: ReaderAnnotationReplayClient,
  repositories: Repositories,
  serverSessionId: string,
  generateClientId?: () => string,
) {
  return replayOfflineReaderAnnotations({
    namespaceKey: "account-a",
    bookId: "book-1",
    serverSessionId,
    client,
    ...repositories,
    generateClientId,
  });
}

function replayClient(annotations: MarginaliaAnnotation[]): ReaderAnnotationReplayClient {
  return {
    marginalia: {
      books: {
        getActiveSession: vi.fn(async () => activeBootstrap("session-new")),
        open: vi.fn(async () => activeBootstrap("session-new")),
      },
      sessions: {
        batchAnnotations: vi.fn(async () => ({ annotations })),
      },
    },
  };
}

function readerState(serverSessionId: string): OfflineReaderBookState {
  return {
    namespaceKey: "account-a",
    bookId: "book-1",
    schemaVersion: 1,
    session: {
      kind: "server-confirmed",
      localSessionId: "local:continuity",
      serverSessionId,
      lastKnownServerStatus: "active",
    },
    progress: null,
    annotations: [],
  };
}

function highlightIntent(
  clientId: string,
  intentRevision: number,
  origin: ReaderAnnotationOrigin,
  note = "note",
  serverSessionId = "session-1",
): UpsertReaderAnnotationIntent {
  return {
    type: "upsert-annotation",
    namespaceKey: "account-a",
    bookId: "book-1",
    serverSessionId,
    intentRevision,
    origin,
    annotation: {
      clientId,
      kind: "highlight",
      location: { cfi: `epubcfi(/6/${clientId.length})`, locationLabel: "010% - Chapter" },
      body: { text: "Quoted text", prefix: "Before", suffix: "After", color: "yellow", note },
    },
  };
}

function deleteIntent(
  clientId: string,
  intentRevision: number,
  origin: ReaderAnnotationOrigin,
  serverSessionId = "session-1",
): Extract<ReaderOutboxIntent, { type: "delete-annotation" }> {
  return {
    type: "delete-annotation",
    namespaceKey: "account-a",
    bookId: "book-1",
    serverSessionId,
    intentRevision,
    origin,
    clientId,
  };
}

function progressIntent(): Extract<ReaderOutboxIntent, { type: "replace-progress" }> {
  return {
    type: "replace-progress",
    namespaceKey: "account-a",
    bookId: "book-1",
    serverSessionId: "session-1",
    intentRevision: 8,
    progress: { cfi: "epubcfi(/6/20)", percentage: 50, locationLabel: "050% - Chapter" },
  };
}

function projection(intent: UpsertReaderAnnotationIntent): OfflineReaderBookState["annotations"][number] {
  return { status: "present", origin: intent.origin, annotation: structuredClone(intent.annotation) };
}

async function putIntents(repository: ReaderOutboxRepository, intents: ReaderOutboxIntent[]) {
  for (const intent of intents) await repository.upsertIntent(intent);
}

function batchOperations(client: ReaderAnnotationReplayClient, call = 0): MarginaliaAnnotationBatchOperation[] {
  return vi.mocked(client.marginalia.sessions.batchAnnotations).mock.calls[call][1];
}

function serverHighlight(clientId: string, note: string): MarginaliaAnnotation {
  return {
    id: `server:${clientId}`,
    clientId,
    kind: "highlight",
    location: { cfi: `epubcfi(/6/${clientId.length})`, locationLabel: "010% - Chapter" },
    body: { text: "Quoted text", prefix: "Before", suffix: "After", color: "yellow", note },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function serverBookmark(clientId: string): MarginaliaAnnotation {
  return {
    id: `server:${clientId}`,
    clientId,
    kind: "bookmark",
    location: { cfi: "epubcfi(/6/20)", locationLabel: "020% - Chapter" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
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

function apiError(status: number, code = "raw private server response"): ApiError {
  return new ApiError({
    kind: status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "http_error",
    status,
    message: `Request failed: ${status} - ${code}`,
  });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error("Condition was not reached.");
}
