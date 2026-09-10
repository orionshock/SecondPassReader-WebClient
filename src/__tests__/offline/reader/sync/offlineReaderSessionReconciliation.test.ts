import { ApiError } from "@secondpass/client";
import type { MarginaliaBootstrap, MarginaliaSession } from "@secondpass/client";
import { describe, expect, it, vi } from "vitest";
import {
  reconcileOfflineReaderSessionAuthority,
  type ReaderSessionAuthority,
} from "../../../../app/offline/reader/sync/OfflineReaderSessionReconciliation.Actions";
import type {
  OfflineReaderBookState,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "../../../../app/offline/storage/OfflineRepositories.Types";
import { createInMemoryOfflineRepositoryFactories } from "../../storage/OfflineRepositoryTest.Fixtures";

describe("offline Reader Session authority reconciliation", () => {
  it("binds provisional continuity to the current active Session without opening", async () => {
    const repositories = await repositoriesWith(state("provisional"), true);
    const authority = authorityWith(activeBootstrap("server-active"));

    const result = await reconcile(authority, repositories);

    expect(result).toMatchObject({
      status: "resolved",
      source: "active-session",
      establishIntentRemoved: true,
      state: { session: { kind: "server-confirmed", serverSessionId: "server-active" } },
    });
    expect(authority.open).not.toHaveBeenCalled();
    expect(authority.getActiveSession).toHaveBeenCalledWith("book-1");
    expect(await repositories.outboxRepository.list("account-a")).toEqual([]);
  });

  it("uses normal open when no active Session exists", async () => {
    const repositories = await repositoriesWith(state("provisional"), true);
    const authority = authorityWith(bootstrap(null), activeBootstrap("opened-session"));

    const result = await reconcile(authority, repositories);

    expect(result).toMatchObject({
      status: "resolved",
      source: "open",
      state: { session: { serverSessionId: "opened-session" } },
    });
    expect(authority.open).toHaveBeenCalledOnce();
    expect(authority.open).toHaveBeenCalledWith("book-1");
  });

  it("preserves remembered authority when the same Session remains active", async () => {
    const repositories = await repositoriesWith(state("active", "server-same"));
    const authority = authorityWith(activeBootstrap("server-same"));

    const result = await reconcile(authority, repositories);

    expect(result).toMatchObject({
      status: "resolved",
      source: "active-session",
      state: { session: { localSessionId: "local:stable", serverSessionId: "server-same" } },
    });
    expect(authority.open).not.toHaveBeenCalled();
  });

  it("rebinds stale remembered authority to a different current active Session", async () => {
    const repositories = await repositoriesWith(state("active", "server-old"));
    const authority = authorityWith(activeBootstrap("server-current"));

    const result = await reconcile(authority, repositories);

    expect(result).toMatchObject({
      status: "resolved",
      state: { session: { serverSessionId: "server-current", lastKnownServerStatus: "active" } },
    });
  });

  it("never reuses remembered closed authority and does not send local IDs to the SDK", async () => {
    const repositories = await repositoriesWith(state("closed", "server-closed"));
    const authority = authorityWith(bootstrap(null), activeBootstrap("server-continuation"));

    const result = await reconcile(authority, repositories);

    expect(result).toMatchObject({
      status: "resolved",
      source: "open",
      state: { session: { serverSessionId: "server-continuation" } },
    });
    expect(authority.getActiveSession).toHaveBeenCalledWith("book-1");
    expect(authority.open).toHaveBeenCalledWith("book-1");
    expect(JSON.stringify(vi.mocked(authority.getActiveSession).mock.calls)).not.toContain("local:stable");
    expect(JSON.stringify(vi.mocked(authority.open).mock.calls)).not.toContain("server-closed");
  });

  it("rejects a closed Session returned by open as writable authority", async () => {
    const repositories = await repositoriesWith(state("provisional"), true);
    const authority = authorityWith(bootstrap(null), bootstrap(session("closed-from-open", "closed")));

    await expect(reconcile(authority, repositories)).resolves.toEqual({ status: "refresh-authority" });
    expect((await repositories.stateRepository.getBookState("account-a", "book-1"))?.session.kind)
      .toBe("provisional");
    expect(await repositories.outboxRepository.list("account-a")).toHaveLength(1);
  });

  it("does not bind a closed active-session snapshot and resolves through normal open", async () => {
    const repositories = await repositoriesWith(state("active", "server-stale"));
    const authority = authorityWith(
      bootstrap(session("server-closed", "closed")),
      activeBootstrap("server-continuation"),
    );

    const result = await reconcile(authority, repositories);

    expect(result).toMatchObject({
      status: "resolved",
      source: "open",
      state: { session: { serverSessionId: "server-continuation" } },
    });
    expect(authority.open).toHaveBeenCalledOnce();
  });

  it("preserves local progress, annotation projection, origin, and local identity while binding", async () => {
    const localState = state("provisional");
    localState.progress = { cfi: "epubcfi(/6/8)", percentage: 30, locationLabel: "030% - Chapter" };
    localState.annotations = [{
      status: "present",
      origin: { kind: "server-confirmed", serverSessionId: "historical-session" },
      annotation: {
        clientId: "annotation-1",
        kind: "highlight",
        location: { cfi: "epubcfi(/6/4)" },
        body: { text: "Text", color: "yellow" },
      },
    }];
    const repositories = await repositoriesWith(localState, true);
    await repositories.outboxRepository.upsertIntent({
      type: "replace-progress",
      namespaceKey: "account-a",
      bookId: "book-1",
      serverSessionId: null,
      intentRevision: 3,
      progress: localState.progress,
    });
    await repositories.outboxRepository.upsertIntent({
      type: "upsert-annotation",
      namespaceKey: "account-a",
      bookId: "book-1",
      serverSessionId: null,
      intentRevision: 2,
      origin: { kind: "local-unconfirmed" },
      annotation: {
        clientId: "local-annotation",
        kind: "bookmark",
        location: { cfi: "epubcfi(/6/10)" },
      },
    });

    const result = await reconcile(authorityWith(activeBootstrap("server-active")), repositories);

    expect(result).toMatchObject({
      status: "resolved",
      state: {
        progress: localState.progress,
        annotations: localState.annotations,
        session: { localSessionId: "local:stable" },
      },
    });
    expect(await repositories.outboxRepository.list("account-a")).toEqual([
      expect.objectContaining({ type: "replace-progress", intentRevision: 3 }),
      expect.objectContaining({ type: "upsert-annotation", intentRevision: 2 }),
    ]);
  });

  it("does no network or local creation when continuity is absent", async () => {
    const repositories = await emptyRepositories();
    const authority = authorityWith(activeBootstrap("unused"));

    await expect(reconcile(authority, repositories)).resolves.toEqual({ status: "no-local-state" });
    expect(authority.getActiveSession).not.toHaveBeenCalled();
    expect(authority.open).not.toHaveBeenCalled();
  });

  it("leaves establishment intent intact when binding persistence fails", async () => {
    const repositories = await repositoriesWith(state("provisional"), true);
    repositories.stateRepository.putBookState = vi.fn(async () => {
      throw new Error("private IndexedDB failure");
    });

    await expect(reconcile(authorityWith(activeBootstrap("server-active")), repositories))
      .resolves.toEqual({ status: "failed" });
    expect(await repositories.outboxRepository.list("account-a")).toHaveLength(1);
  });

  it("keeps a durable binding when establishment-intent cleanup fails", async () => {
    const repositories = await repositoriesWith(state("provisional"), true);
    repositories.outboxRepository.remove = vi.fn(async () => {
      throw new Error("private outbox failure");
    });

    const result = await reconcile(authorityWith(activeBootstrap("server-active")), repositories);

    expect(result).toMatchObject({ status: "resolved", establishIntentRemoved: false });
    expect((await repositories.stateRepository.getBookState("account-a", "book-1"))?.session)
      .toMatchObject({ kind: "server-confirmed", serverSessionId: "server-active" });
    expect(await repositories.outboxRepository.list("account-a")).toHaveLength(1);
  });

  it.each([
    { error: new TypeError("Failed to fetch https://private.invalid"), expected: { status: "retry-later", retryAfterMs: null } },
    { error: apiError(503), expected: { status: "retry-later", retryAfterMs: null } },
    { error: apiError(401), expected: { status: "reauthenticate" } },
    { error: apiError(403), expected: { status: "refresh-authority" } },
    { error: apiError(404), expected: { status: "refresh-authority" } },
    { error: apiError(400), expected: { status: "unavailable" } },
    { error: new Error("unrecognized private detail"), expected: { status: "failed" } },
  ])("normalizes authority failure without exposing raw content", async ({ error, expected }) => {
    const repositories = await repositoriesWith(state("provisional"), true);
    const authority = authorityWith(activeBootstrap("unused"));
    vi.mocked(authority.getActiveSession).mockRejectedValue(error);

    const result = await reconcile(authority, repositories);

    expect(result).toEqual(expected);
    expect(JSON.stringify(result)).not.toContain("private.invalid");
  });

  it("converges concurrent same-runtime resolution and never invokes start-over", async () => {
    const repositories = await repositoriesWith(state("provisional"), true);
    let resolveActive!: (value: MarginaliaBootstrap) => void;
    const pending = new Promise<MarginaliaBootstrap>((resolve) => { resolveActive = resolve; });
    const authority = {
      ...authorityWith(activeBootstrap("unused")),
      startOver: vi.fn(),
    };
    vi.mocked(authority.getActiveSession).mockReturnValue(pending);

    const first = reconcile(authority, repositories);
    const second = reconcile(authority, repositories);
    expect(first).toBe(second);
    resolveActive(activeBootstrap("server-active"));

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toEqual(secondResult);
    expect(authority.getActiveSession).toHaveBeenCalledOnce();
    expect(authority.startOver).not.toHaveBeenCalled();
  });
});

type Repositories = {
  stateRepository: OfflineReaderStateRepository;
  outboxRepository: ReaderOutboxRepository;
};

async function emptyRepositories(): Promise<Repositories> {
  const factories = createInMemoryOfflineRepositoryFactories();
  return {
    stateRepository: await factories.createReaderStateRepository(),
    outboxRepository: await factories.createReaderOutboxRepository(),
  };
}

async function repositoriesWith(localState: OfflineReaderBookState, establish = false): Promise<Repositories> {
  const repositories = await emptyRepositories();
  await repositories.stateRepository.putBookState(localState);
  if (establish) {
    await repositories.outboxRepository.upsertIntent({
      type: "establish-session",
      namespaceKey: localState.namespaceKey,
      bookId: localState.bookId,
    });
  }
  return repositories;
}

function reconcile(authority: ReaderSessionAuthority, repositories: Repositories) {
  return reconcileOfflineReaderSessionAuthority({
    namespaceKey: "account-a",
    bookId: "book-1",
    authority,
    ...repositories,
  });
}

function authorityWith(active: MarginaliaBootstrap, opened = activeBootstrap("opened")) {
  return {
    getActiveSession: vi.fn(async () => active),
    open: vi.fn(async () => opened),
  } satisfies ReaderSessionAuthority;
}

function state(kind: "provisional" | "active" | "closed", serverSessionId = "server-existing"): OfflineReaderBookState {
  return {
    namespaceKey: "account-a",
    bookId: "book-1",
    schemaVersion: 1,
    session: kind === "provisional"
      ? {
          kind: "provisional",
          localSessionId: "local:stable",
          serverSessionId: null,
          lastKnownServerStatus: null,
        }
      : {
          kind: "server-confirmed",
          localSessionId: "local:stable",
          serverSessionId,
          lastKnownServerStatus: kind,
        },
    progress: null,
    annotations: [],
  };
}

function activeBootstrap(id: string): MarginaliaBootstrap {
  return bootstrap(session(id, "active"));
}

function bootstrap(value: MarginaliaSession | null): MarginaliaBootstrap {
  return {
    created: false,
    context: { book: { id: "book-1", title: "Book", coverUrl: null, canOpen: true } },
    session: value,
    annotations: [],
    closedSessions: { count: 0, next: null, previous: null, results: [] },
  };
}

function session(id: string, status: "active" | "closed"): MarginaliaSession {
  return {
    id,
    name: "",
    notes: "",
    status,
    startedAt: "2026-01-01T00:00:00Z",
    closedAt: status === "closed" ? "2026-01-02T00:00:00Z" : null,
    updatedAt: "2026-01-01T00:00:00Z",
    lastActivityAt: "2026-01-01T00:00:00Z",
    annotationCount: 0,
    progress: null,
  };
}

function apiError(status: number): ApiError {
  return new ApiError({
    kind: status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "http_error",
    status,
    message: `raw private response ${status}`,
  });
}
