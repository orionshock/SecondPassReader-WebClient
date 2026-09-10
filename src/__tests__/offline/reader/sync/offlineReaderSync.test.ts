import { ApiError } from "@secondpass/client";
import type {
  MarginaliaAnnotation,
  MarginaliaBootstrap,
  MarginaliaProgress,
  MarginaliaSession,
} from "@secondpass/client";
import { describe, expect, it, vi } from "vitest";
import {
  syncOfflineReader,
  type OfflineReaderSyncClient,
} from "../../../../app/offline/reader/sync/OfflineReaderSync.Actions";
import type {
  OfflineReaderBookState,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "../../../../app/offline/storage/OfflineRepositories.Types";
import {
  readerIntentResourceKey,
  type ReaderOutboxIntent,
  type ReplaceReaderProgressIntent,
  type UpsertReaderAnnotationIntent,
} from "../../../../app/offline/reader/outbox/ReaderOutbox.Policy";
import { createInMemoryOfflineRepositoryFactories } from "../../storage/OfflineRepositoryTest.Fixtures";

describe("explicit offline Reader sync", () => {
  it("returns nothing-to-sync without touching server authority", async () => {
    const repositories = await repositoriesWithState(readerState());
    const client = syncClient();

    await expect(sync(client, repositories)).resolves.toEqual({ status: "nothing-to-sync" });
    expect(client.marginalia.books.getActiveSession).not.toHaveBeenCalled();
    expect(client.marginalia.books.open).not.toHaveBeenCalled();
    expect(client.marginalia.sessions.batchAnnotations).not.toHaveBeenCalled();
    expect(client.marginalia.sessions.replaceProgress).not.toHaveBeenCalled();
  });

  it("orders authority, annotations, then progress and acknowledges both", async () => {
    const order: string[] = [];
    const progress = progressIntent();
    const annotation = annotationIntent();
    const state = readerState(progress.progress);
    state.annotations = [projection(annotation)];
    const repositories = await repositoriesWithState(state, [annotation, progress]);
    const client = syncClient(order, [serverAnnotation(annotation)]);

    const result = await sync(client, repositories);

    expect(order).toEqual(["authority", "annotations", "progress"]);
    expect(result).toMatchObject({
      status: "synced",
      serverSessionId: "session-1",
      annotationsSynced: 1,
      progressSynced: true,
      continuation: null,
    });
    expect(await repositories.outboxRepository.list("account-a")).toEqual([]);
  });

  it("completes annotation-only and progress-only cycles", async () => {
    const annotationRepositories = await repositoriesWithState(readerState(), [annotationIntent()]);
    const annotationClient = syncClient([], [serverAnnotation(annotationIntent())]);
    const progress = progressIntent("account-b", "book-2");
    const progressRepositories = await repositoriesWithState(
      readerState(progress.progress, "account-b", "book-2"),
      [progress],
    );
    const progressClient = syncClient();

    const [annotationResult, progressResult] = await Promise.all([
      sync(annotationClient, annotationRepositories),
      sync(progressClient, progressRepositories, "book-2", "account-b"),
    ]);

    expect(annotationResult).toMatchObject({ status: "synced", annotationsSynced: 1, progressSynced: false });
    expect(annotationClient.marginalia.sessions.replaceProgress).not.toHaveBeenCalled();
    expect(progressResult).toMatchObject({ status: "synced", annotationsSynced: 0, progressSynced: true });
    expect(progressClient.marginalia.sessions.batchAnnotations).not.toHaveBeenCalled();
  });

  it("passes annotation continuation authority and counts to progress", async () => {
    const progress = progressIntent();
    const annotation = annotationIntent();
    const state = readerState(progress.progress);
    state.annotations = [projection(annotation)];
    const repositories = await repositoriesWithState(state, [annotation, progress]);
    const client = syncClient([], [serverAnnotation(annotation)]);
    vi.mocked(client.marginalia.books.getActiveSession)
      .mockResolvedValueOnce(activeBootstrap("session-1"))
      .mockResolvedValueOnce(activeBootstrap("session-2"));
    vi.mocked(client.marginalia.sessions.batchAnnotations)
      .mockRejectedValueOnce(apiError(409, "SESSION_CLOSED"))
      .mockResolvedValueOnce({ annotations: [serverAnnotation(annotation)] });

    const result = await sync(client, repositories);

    expect(vi.mocked(client.marginalia.sessions.batchAnnotations).mock.calls.map((call) => call[0]))
      .toEqual(["session-1", "session-2"]);
    expect(client.marginalia.sessions.replaceProgress).toHaveBeenCalledWith("session-2", expect.any(Object));
    expect(result).toMatchObject({
      status: "synced",
      serverSessionId: "session-2",
      continuation: { continuedLocalUpserts: 1, fromSessionId: "session-1", toSessionId: "session-2" },
    });
    expect("startOver" in client.marginalia.books).toBe(false);
  });

  it("retains annotation success when progress must retry", async () => {
    const progress = progressIntent();
    const annotation = annotationIntent();
    const state = readerState(progress.progress);
    state.annotations = [projection(annotation)];
    const repositories = await repositoriesWithState(state, [annotation, progress]);
    const client = syncClient([], [serverAnnotation(annotation)]);
    vi.mocked(client.marginalia.sessions.replaceProgress)
      .mockRejectedValue(new TypeError("Failed to fetch https://secret.invalid"));

    const result = await sync(client, repositories);

    expect(result).toMatchObject({
      status: "partially-synced",
      stoppedAt: "progress",
      failure: { status: "retry-later", retryAfterMs: null },
      annotationsSynced: 1,
      progressSynced: false,
    });
    expect(await repositories.outboxRepository.list("account-a")).toEqual([{
      ...progress,
      attempt: expect.objectContaining({ revision: progress.intentRevision, classification: "retry-later" }),
    }]);
    expect(JSON.stringify(result)).not.toContain("secret.invalid");
  });

  it("automatically skips a terminal annotation while still delivering eligible progress", async () => {
    const desired = progressIntent();
    const annotation = annotationIntent();
    annotation.attempt = {
      revision: annotation.intentRevision,
      classification: "terminal-request",
      attemptCount: 1,
      attemptedAt: 1_000,
      retryEligibleAt: null,
    };
    const state = readerState(desired.progress);
    state.annotations = [{ status: "present", origin: annotation.origin, annotation: annotation.annotation }];
    const repositories = await repositoriesWithState(state, [annotation, desired]);
    await repositories.outboxRepository.recordAttempt(
      "account-a",
      readerIntentResourceKey(annotation),
      annotation.intentRevision,
      annotation.attempt!,
    );
    const client = syncClient();

    const result = await syncOfflineReader({
      namespaceKey: "account-a", bookId: "book-1", client, ...repositories,
      attemptMode: "automatic", now: () => 2_000,
    });

    expect(client.marginalia.sessions.batchAnnotations).not.toHaveBeenCalled();
    expect(client.marginalia.sessions.replaceProgress).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ status: "partially-synced", progressSynced: true });
    expect(await repositories.outboxRepository.list("account-a")).toEqual([annotation]);
  });

  it("stops before progress when annotation delivery is terminal", async () => {
    const progress = progressIntent();
    const annotation = annotationIntent();
    const state = readerState(progress.progress);
    state.annotations = [projection(annotation)];
    const repositories = await repositoriesWithState(state, [annotation, progress]);
    const client = syncClient();
    vi.mocked(client.marginalia.sessions.batchAnnotations).mockRejectedValue(apiError(400));

    await expect(sync(client, repositories)).resolves.toEqual({ status: "terminal", stage: "annotations" });
    expect(client.marginalia.sessions.replaceProgress).not.toHaveBeenCalled();
    expect(await repositories.outboxRepository.list("account-a")).toHaveLength(2);
  });

  it("stops both delivery stages when authority cannot be reconciled", async () => {
    const repositories = await repositoriesWithState(readerState(), [annotationIntent()]);
    const client = syncClient();
    vi.mocked(client.marginalia.books.getActiveSession).mockRejectedValue(apiError(401));

    await expect(sync(client, repositories)).resolves.toEqual({ status: "reauthenticate", stage: "authority" });
    expect(client.marginalia.sessions.batchAnnotations).not.toHaveBeenCalled();
    expect(client.marginalia.sessions.replaceProgress).not.toHaveBeenCalled();
  });

  it("shares a complete same-Book cycle while different Books remain independent", async () => {
    const firstRepositories = await repositoriesWithState(readerState(), [annotationIntent()]);
    const secondRepositories = await repositoriesWithState(readerState(null, "account-b", "book-2"), [
      annotationIntent("account-b", "book-2"),
    ]);
    let resolveAuthority!: (value: MarginaliaBootstrap) => void;
    const pendingAuthority = new Promise<MarginaliaBootstrap>((resolve) => { resolveAuthority = resolve; });
    const firstClient = syncClient();
    vi.mocked(firstClient.marginalia.books.getActiveSession).mockReturnValue(pendingAuthority);
    const secondClient = syncClient();

    const first = sync(firstClient, firstRepositories);
    const duplicate = sync(firstClient, firstRepositories);
    const other = sync(secondClient, secondRepositories, "book-2", "account-b");

    expect(first).toBe(duplicate);
    await expect(other).resolves.toMatchObject({ status: "synced" });
    expect(secondClient.marginalia.sessions.batchAnnotations).toHaveBeenCalledOnce();
    resolveAuthority(activeBootstrap("session-1"));
    await Promise.all([first, duplicate]);
    expect(firstClient.marginalia.books.getActiveSession).toHaveBeenCalledOnce();
    expect(firstClient.marginalia.sessions.batchAnnotations).toHaveBeenCalledOnce();
  });
});

type Repositories = {
  stateRepository: OfflineReaderStateRepository;
  outboxRepository: ReaderOutboxRepository;
};

async function repositoriesWithState(
  state: OfflineReaderBookState,
  intents: ReaderOutboxIntent[] = [],
): Promise<Repositories> {
  const factories = createInMemoryOfflineRepositoryFactories();
  const repositories = {
    stateRepository: await factories.createReaderStateRepository(),
    outboxRepository: await factories.createReaderOutboxRepository(),
  };
  await repositories.stateRepository.putBookState(state);
  for (const intent of intents) await repositories.outboxRepository.upsertIntent(intent);
  return repositories;
}

function sync(
  client: OfflineReaderSyncClient,
  repositories: Repositories,
  bookId = "book-1",
  namespaceKey = "account-a",
) {
  return syncOfflineReader({ namespaceKey, bookId, client, ...repositories });
}

function syncClient(order: string[] = [], annotations: MarginaliaAnnotation[] = []): OfflineReaderSyncClient {
  return {
    marginalia: {
      books: {
        getActiveSession: vi.fn(async (bookId: string) => {
          order.push("authority");
          return activeBootstrap("session-1", bookId);
        }),
        open: vi.fn(async (bookId: string) => activeBootstrap("session-1", bookId)),
      },
      sessions: {
        batchAnnotations: vi.fn(async () => {
          order.push("annotations");
          return { annotations };
        }),
        replaceProgress: vi.fn(async (_sessionId, input) => {
          order.push("progress");
          return { progress: serverProgress(input.cfi, input.locationLabel) };
        }),
      },
    },
  };
}

function readerState(
  progress: ReplaceReaderProgressIntent["progress"] | null = null,
  namespaceKey = "account-a",
  bookId = "book-1",
): OfflineReaderBookState {
  return {
    namespaceKey,
    bookId,
    schemaVersion: 1,
    session: {
      kind: "server-confirmed",
      localSessionId: `local:${bookId}`,
      serverSessionId: "session-1",
      lastKnownServerStatus: "active",
    },
    progress,
    annotations: [],
  };
}

function progressIntent(
  namespaceKey = "account-a",
  bookId = "book-1",
): ReplaceReaderProgressIntent {
  return {
    type: "replace-progress",
    namespaceKey,
    bookId,
    serverSessionId: "session-1",
    intentRevision: 1,
    progress: { cfi: "epubcfi(/6/12)", percentage: 60, locationLabel: "060% - Chapter" },
  };
}

function annotationIntent(
  namespaceKey = "account-a",
  bookId = "book-1",
): UpsertReaderAnnotationIntent {
  return {
    type: "upsert-annotation",
    namespaceKey,
    bookId,
    serverSessionId: "session-1",
    intentRevision: 1,
    origin: { kind: "local-unconfirmed" },
    annotation: {
      clientId: `annotation:${bookId}`,
      kind: "bookmark",
      location: { cfi: "epubcfi(/6/8)", locationLabel: "040% - Chapter" },
    },
  };
}

function projection(intent: UpsertReaderAnnotationIntent): OfflineReaderBookState["annotations"][number] {
  return { status: "present", origin: intent.origin, annotation: structuredClone(intent.annotation) };
}

function serverAnnotation(intent: UpsertReaderAnnotationIntent): MarginaliaAnnotation {
  const annotation = intent.annotation;
  const identity = {
    id: `server:${annotation.clientId}`,
    clientId: annotation.clientId,
    location: {
      cfi: annotation.location.cfi,
      locationLabel: annotation.location.locationLabel ?? "040% - Chapter",
    },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
  return annotation.kind === "bookmark"
    ? { ...identity, kind: "bookmark" }
    : {
        ...identity,
        kind: "highlight",
        body: {
          text: annotation.body.text,
          prefix: annotation.body.prefix ?? "",
          suffix: annotation.body.suffix ?? "",
          color: annotation.body.color ?? "yellow",
          note: annotation.body.note ?? "",
        },
      };
}

function activeBootstrap(id: string, bookId = "book-1"): MarginaliaBootstrap {
  return {
    created: false,
    context: { book: { id: bookId, title: "Book", coverUrl: null, canOpen: true } },
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

function serverProgress(cfi: string, locationLabel: string): MarginaliaProgress {
  return { cfi, locationLabel, updatedAt: "2026-01-01T00:00:00Z" };
}

function apiError(status: number, code = "private server response"): ApiError {
  return new ApiError({
    kind: status === 401 ? "unauthorized" : "http_error",
    status,
    message: `Request failed: ${status} - ${code}`,
  });
}
