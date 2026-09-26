import { ApiError } from "@secondpass/client";
import type { MarginaliaBootstrap, MarginaliaProgress, MarginaliaSession } from "@secondpass/client";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import {
  replayOfflineReaderProgress,
  type ReaderProgressReplayClient,
} from "../../../../app/offline/reader/replay/OfflineReaderProgressReplay.Actions";
import { openIndexedDbOfflineRepositories } from "../../../../app/offline/storage/IndexedDbOfflineRepositories.Factory";
import type {
  OfflineReaderBookState,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "../../../../app/offline/storage/OfflineRepositories.Types";
import { readerIntentResourceKey, type ReaderOutboxIntent, type ReplaceReaderProgressIntent } from "../../../../app/offline/reader/outbox/ReaderOutbox.Policy";
import { createInMemoryOfflineRepositoryFactories } from "../../storage/OfflineRepositoryTest.Fixtures";

describe("offline Reader progress replay", () => {
  it("returns nothing-to-replay without calling the SDK", async () => {
    const repositories = await repositoriesWithState(readerState(progress("epubcfi(/6/4)", 20)));
    const client = replayClient();

    await expect(replay(client, repositories, "session-1")).resolves.toEqual({ status: "nothing-to-replay" });
    expect(client.marginalia.sessions.replaceProgress).not.toHaveBeenCalled();
  });

  it("delivers one current desired value and exact-removes only its progress revision", async () => {
    const desired = progress("epubcfi(/6/8)", 30);
    const repositories = await repositoriesWithState(readerState(desired));
    const intent = progressIntent(desired, 4);
    const annotation = annotationIntent();
    await repositories.outboxRepository.upsertIntent(intent);
    await repositories.outboxRepository.upsertIntent(annotation);
    const client = replayClient({ ...serverProgress(desired), locationLabel: "Server label" });

    const result = await replay(client, repositories, "session-1");

    expect(client.marginalia.sessions.replaceProgress).toHaveBeenCalledWith("session-1", {
      location: desired.location,
      locationLabel: desired.locationLabel,
    });
    expect(result).toEqual({
      status: "replayed",
      sessionId: "session-1",
      deliveredRevision: 4,
      acknowledged: true,
      remaining: 0,
      continuedFromSessionId: null,
    });
    expect((await repositories.stateRepository.getBookState("account-a", "book-1"))?.progress)
      .toEqual({ ...desired, locationLabel: "Server label" });
    expect(await repositories.outboxRepository.list("account-a")).toEqual([annotation]);
  });

  it("never selects an older queued value that does not match durable local progress", async () => {
    const latest = progress("epubcfi(/6/10)", 40);
    const repositories = await repositoriesWithState(readerState(latest));
    await repositories.outboxRepository.upsertIntent(progressIntent(progress("epubcfi(/6/2)", 5), 9));
    const client = replayClient();

    await expect(replay(client, repositories, "session-1")).resolves.toEqual({ status: "nothing-to-replay" });
    expect(client.marginalia.sessions.replaceProgress).not.toHaveBeenCalled();
    expect(await repositories.outboxRepository.list("account-a")).toHaveLength(1);
  });

  it("keeps a newer revision and local value written while PUT is in flight", async () => {
    const first = progress("epubcfi(/6/4)", 20);
    const newer = progress("epubcfi(/6/12)", 60);
    const repositories = await repositoriesWithState(readerState(first));
    await repositories.outboxRepository.upsertIntent(progressIntent(first, 1));
    let resolvePut!: (value: { progress: MarginaliaProgress }) => void;
    const pending = new Promise<{ progress: MarginaliaProgress }>((resolve) => { resolvePut = resolve; });
    const client = replayClient();
    vi.mocked(client.marginalia.sessions.replaceProgress).mockReturnValue(pending);

    const replaying = replay(client, repositories, "session-1");
    await waitFor(() => vi.mocked(client.marginalia.sessions.replaceProgress).mock.calls.length === 1);
    const state = (await repositories.stateRepository.getBookState("account-a", "book-1"))!;
    await repositories.stateRepository.putBookState({ ...state, progress: newer });
    await repositories.outboxRepository.upsertIntent(progressIntent(newer, 2));
    resolvePut({ progress: serverProgress(first) });

    const result = await replaying;

    expect(result).toMatchObject({ status: "replayed", acknowledged: false, remaining: 1 });
    expect((await repositories.stateRepository.getBookState("account-a", "book-1"))?.progress).toEqual(newer);
    expect(await repositories.outboxRepository.list("account-a")).toEqual([progressIntent(newer, 2)]);
  });

  it("reconciles mismatched authority and never sends a provisional ID", async () => {
    const desired = progress("epubcfi(/6/8)", 30);
    const state = readerState(desired);
    state.session = {
      kind: "provisional",
      localSessionId: "local:provisional",
      serverSessionId: null,
      lastKnownServerStatus: null,
    };
    const repositories = await repositoriesWithState(state);
    await repositories.outboxRepository.upsertIntent(progressIntent(desired, 1, null));
    const client = replayClient();
    vi.mocked(client.marginalia.books.getActiveSession).mockResolvedValue(activeBootstrap("session-current"));

    const result = await replay(client, repositories, "local:provisional");

    expect(result).toMatchObject({ status: "replayed", sessionId: "session-current" });
    expect(client.marginalia.sessions.replaceProgress).toHaveBeenCalledWith("session-current", expect.any(Object));
    expect(JSON.stringify(vi.mocked(client.marginalia.sessions.replaceProgress).mock.calls))
      .not.toContain("local:provisional");
  });

  it.each([
    { error: new TypeError("Failed to fetch https://secret.invalid"), expected: { status: "retry-later", retryAfterMs: null } },
    { error: apiError(503), expected: { status: "retry-later", retryAfterMs: null } },
    { error: apiError(401), expected: { status: "reauthenticate" } },
    { error: apiError(403), expected: { status: "refresh-authority" } },
    { error: apiError(404), expected: { status: "refresh-authority" } },
    { error: apiError(400), expected: { status: "terminal-request" } },
  ])("retains progress and intent for normalized delivery failure", async ({ error, expected }) => {
    const desired = progress("epubcfi(/6/8)", 30);
    const repositories = await repositoriesWithState(readerState(desired));
    const intent = progressIntent(desired, 1);
    await repositories.outboxRepository.upsertIntent(intent);
    const client = replayClient();
    vi.mocked(client.marginalia.sessions.replaceProgress).mockRejectedValue(error);

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
    expect((await repositories.stateRepository.getBookState("account-a", "book-1"))?.progress).toEqual(desired);
    expect(JSON.stringify(result)).not.toContain("secret.invalid");
  });

  it("does not attach an older request failure to a newer progress revision", async () => {
    const first = progress("epubcfi(/6/8)", 30);
    const newer = progress("epubcfi(/6/10)", 40);
    const repositories = await repositoriesWithState(readerState(first));
    await repositories.outboxRepository.upsertIntent(progressIntent(first, 1));
    const client = replayClient();
    let rejectRequest!: (reason: unknown) => void;
    vi.mocked(client.marginalia.sessions.replaceProgress).mockReturnValue(new Promise((_resolve, reject) => {
      rejectRequest = reject;
    }));

    const running = replay(client, repositories, "session-1");
    await vi.waitFor(() => expect(client.marginalia.sessions.replaceProgress).toHaveBeenCalledOnce());
    await repositories.stateRepository.putBookState(readerState(newer));
    await repositories.outboxRepository.upsertIntent(progressIntent(newer, 2));
    rejectRequest(apiError(400));

    await expect(running).resolves.toEqual({ status: "terminal-request" });
    expect(await repositories.outboxRepository.list("account-a")).toEqual([progressIntent(newer, 2)]);
  });

  it("reloads and sends only the newest progress after SESSION_CLOSED reconciliation", async () => {
    const first = progress("epubcfi(/6/4)", 20);
    const latest = progress("epubcfi(/6/14)", 70);
    const repositories = await repositoriesWithState(readerState(first));
    await repositories.outboxRepository.upsertIntent(progressIntent(first, 1));
    const client = replayClient();
    vi.mocked(client.marginalia.sessions.replaceProgress)
      .mockRejectedValueOnce(apiError(409, "SESSION_CLOSED"))
      .mockResolvedValueOnce({ progress: serverProgress(latest) });
    let resolveAuthority!: (value: MarginaliaBootstrap) => void;
    const pendingAuthority = new Promise<MarginaliaBootstrap>((resolve) => { resolveAuthority = resolve; });
    vi.mocked(client.marginalia.books.getActiveSession).mockReturnValue(pendingAuthority);

    const replaying = replay(client, repositories, "session-1");
    await waitFor(() => vi.mocked(client.marginalia.books.getActiveSession).mock.calls.length === 1);
    const state = (await repositories.stateRepository.getBookState("account-a", "book-1"))!;
    await repositories.stateRepository.putBookState({ ...state, progress: latest });
    await repositories.outboxRepository.upsertIntent(progressIntent(latest, 2));
    resolveAuthority(activeBootstrap("session-2"));

    const result = await replaying;

    expect(vi.mocked(client.marginalia.sessions.replaceProgress).mock.calls).toEqual([
      ["session-1", { location: first.location, locationLabel: first.locationLabel }],
      ["session-2", { location: latest.location, locationLabel: latest.locationLabel }],
    ]);
    expect(result).toMatchObject({
      status: "replayed",
      sessionId: "session-2",
      deliveredRevision: 2,
      continuedFromSessionId: "session-1",
    });
    expect(await repositories.outboxRepository.list("account-a")).toEqual([]);
    expect("startOver" in client.marginalia.books).toBe(false);
  });

  it("shares one in-flight PUT for the same Book while another Book remains independent", async () => {
    const desired = progress("epubcfi(/6/8)", 30);
    const repositories = await repositoriesWithState(readerState(desired));
    await repositories.outboxRepository.upsertIntent(progressIntent(desired, 1));
    const otherState = { ...readerState(desired), bookId: "book-2" };
    await repositories.stateRepository.putBookState(otherState);
    await repositories.outboxRepository.upsertIntent({ ...progressIntent(desired, 1), bookId: "book-2" });
    let resolveFirst!: (value: { progress: MarginaliaProgress }) => void;
    const firstPending = new Promise<{ progress: MarginaliaProgress }>((resolve) => { resolveFirst = resolve; });
    const client = replayClient();
    vi.mocked(client.marginalia.sessions.replaceProgress)
      .mockReturnValueOnce(firstPending)
      .mockResolvedValueOnce({ progress: serverProgress(desired) });

    const first = replay(client, repositories, "session-1");
    const duplicate = replay(client, repositories, "session-1");
    const other = replayOfflineReaderProgress({
      namespaceKey: "account-a",
      bookId: "book-2",
      serverSessionId: "session-1",
      client,
      ...repositories,
    });
    expect(first).toBe(duplicate);
    await expect(other).resolves.toMatchObject({ status: "replayed" });
    expect(client.marginalia.sessions.replaceProgress).toHaveBeenCalledTimes(2);
    resolveFirst({ progress: serverProgress(desired) });
    await Promise.all([first, duplicate]);
  });

  it("retains terminally rejected progress across IndexedDB close and reopen", async () => {
    const indexedDb = new IDBFactory();
    const options = { indexedDb, databaseName: "progress-replay-terminal" };
    const first = await openIndexedDbOfflineRepositories(options);
    const desired = progress("epubcfi(/6/8)", 30);
    await first.readerState.putBookState(readerState(desired));
    await first.readerOutbox.upsertIntent(progressIntent(desired, 1));
    const client = replayClient();
    vi.mocked(client.marginalia.sessions.replaceProgress).mockRejectedValue(apiError(400));

    await expect(replay(client, {
      stateRepository: first.readerState,
      outboxRepository: first.readerOutbox,
    }, "session-1")).resolves.toEqual({ status: "terminal-request" });
    first.close();

    const reopened = await openIndexedDbOfflineRepositories(options);
    expect(await reopened.readerOutbox.list("account-a")).toEqual([{
      ...progressIntent(desired, 1),
      attempt: expect.objectContaining({ revision: 1, classification: "terminal-request", attemptCount: 1 }),
    }]);
    expect((await reopened.readerState.getBookState("account-a", "book-1"))?.progress).toEqual(desired);
    reopened.close();
  });

  it("skips deferred progress automatically and allows an explicit manual retry", async () => {
    const desired = progress("epubcfi(/6/8)", 30);
    const repositories = await repositoriesWithState(readerState(desired));
    await repositories.outboxRepository.upsertIntent(progressIntent(desired, 1));
    const current = (await repositories.outboxRepository.list("account-a"))[0];
    await repositories.outboxRepository.recordAttempt("account-a", readerIntentResourceKey(current), 1, {
      revision: 1, classification: "retry-later", attemptCount: 1, attemptedAt: 1_000, retryEligibleAt: 2_000,
    });
    const client = replayClient();

    await expect(replayOfflineReaderProgress({
      namespaceKey: "account-a", bookId: "book-1", serverSessionId: "session-1", client,
      ...repositories, attemptMode: "automatic", now: () => 1_500,
    })).resolves.toEqual({ status: "nothing-eligible" });
    expect(client.marginalia.sessions.replaceProgress).not.toHaveBeenCalled();

    await expect(replayOfflineReaderProgress({
      namespaceKey: "account-a", bookId: "book-1", serverSessionId: "session-1", client,
      ...repositories, attemptMode: "manual", now: () => 1_500,
    })).resolves.toMatchObject({ status: "replayed", acknowledged: true });
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

function replay(client: ReaderProgressReplayClient, repositories: Repositories, serverSessionId: string) {
  return replayOfflineReaderProgress({
    namespaceKey: "account-a",
    bookId: "book-1",
    serverSessionId,
    client,
    ...repositories,
  });
}

function replayClient(confirmed = serverProgress(progress("epubcfi(/6/8)", 30))): ReaderProgressReplayClient {
  return {
    marginalia: {
      books: {
        getActiveSession: vi.fn(async () => activeBootstrap("session-2")),
        open: vi.fn(async () => activeBootstrap("session-2")),
      },
      sessions: {
        replaceProgress: vi.fn(async () => ({ progress: confirmed })),
      },
    },
  };
}

function readerState(value: ReplaceReaderProgressIntent["progress"]): OfflineReaderBookState {
  return {
    annotationRevision: 0,
    namespaceKey: "account-a",
    bookId: "book-1",
    schemaVersion: 1,
    session: {
      kind: "server-confirmed",
      localSessionId: "local:continuity",
      serverSessionId: "session-1",
      lastKnownServerStatus: "active",
    },
    progress: value,
    annotations: [],
  };
}

function progress(cfi: string, percentage: number): ReplaceReaderProgressIntent["progress"] {
  return { location: cfi, percentage, locationLabel: `${String(percentage).padStart(3, "0")}% - Chapter` };
}

function progressIntent(
  value: ReplaceReaderProgressIntent["progress"],
  intentRevision: number,
  serverSessionId: string | null = "session-1",
): ReplaceReaderProgressIntent {
  return {
    type: "replace-progress",
    namespaceKey: "account-a",
    bookId: "book-1",
    serverSessionId,
    intentRevision,
    progress: value,
  };
}

function annotationIntent(): Extract<ReaderOutboxIntent, { type: "upsert-annotation" }> {
  return {
    type: "upsert-annotation",
    namespaceKey: "account-a",
    bookId: "book-1",
    serverSessionId: "session-1",
    intentRevision: 1,
    origin: { kind: "local-unconfirmed" },
    annotation: { clientId: "annotation-1", kind: "bookmark", location: { location: "epubcfi(/6/4)" } },
  };
}

function serverProgress(value: ReplaceReaderProgressIntent["progress"]): MarginaliaProgress {
  return { location: value.location, locationLabel: value.locationLabel, updatedAt: "2026-01-01T00:00:00Z" };
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
