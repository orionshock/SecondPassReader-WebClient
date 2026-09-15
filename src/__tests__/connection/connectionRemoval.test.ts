// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { removeConnectionAndOfflineData } from "../../features/connection/ConnectionRemoval.Controller";
import { clearActiveConnection, saveConnectionProfile, type ConnectionProfile } from "../../storage/ConnectionProfiles.Store";

describe("destructive connection removal", () => {
  beforeEach(() => {
    clearActiveConnection();
    saveConnectionProfile(connection());
  });

  it("syncs pending work with waiting coordination, rechecks it, then removes after confirmation", async () => {
    const inspectNamespace = vi.fn()
      .mockResolvedValueOnce(summary({ pendingIntents: 2 }))
      .mockResolvedValueOnce(summary({ pendingIntents: 0 }));
    const syncPending = vi.fn(async () => ({ status: "completed" as const, discoveredBooks: 1, attemptedBooks: 1, outcome: outcome() }));
    const removeNamespace = vi.fn(async () => ({ status: "removed" as const }));
    const onRemoved = vi.fn();

    await expect(removeConnectionAndOfflineData({
      expectedConnection: connection(),
      intent: "forget",
      namespaceKey: "account-a",
      client: clientStub(),
      connectivity: "online",
      confirm: () => true,
      onRemoved,
      inspectNamespace,
      removeNamespace,
      syncPending,
    })).resolves.toEqual({ status: "removed" });

    expect(syncPending).toHaveBeenCalledWith(expect.objectContaining({ namespaceKey: "account-a", mode: "wait" }));
    expect(inspectNamespace).toHaveBeenCalledTimes(2);
    expect(removeNamespace).toHaveBeenCalledWith("account-a");
    expect(onRemoved).toHaveBeenCalledOnce();
  });

  it("warns about unsynced work while offline without trying delivery", async () => {
    const syncPending = vi.fn();
    const confirmationMessages: string[] = [];
    const confirm = vi.fn((message: string) => {
      confirmationMessages.push(message);
      return false;
    });
    const removeNamespace = vi.fn();

    await expect(removeConnectionAndOfflineData({
      expectedConnection: connection(),
      intent: "sign-out",
      namespaceKey: "account-a",
      client: clientStub(),
      connectivity: "offline",
      confirm,
      onRemoved: vi.fn(),
      inspectNamespace: async () => summary({ pendingIntents: 1, offlineAssetCount: 1 }),
      removeNamespace,
      syncPending,
    })).resolves.toEqual({ status: "cancelled" });

    expect(syncPending).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirmationMessages[0]).toBeTruthy();
    expect(removeNamespace).not.toHaveBeenCalled();
  });

  it("keeps the saved connection when namespace cleanup fails", async () => {
    const onRemoved = vi.fn();
    await expect(removeConnectionAndOfflineData({
      expectedConnection: connection(),
      intent: "forget",
      namespaceKey: "account-a",
      client: null,
      connectivity: "unknown",
      confirm: () => true,
      onRemoved,
      inspectNamespace: async () => summary(),
      removeNamespace: async () => ({ status: "failed" }),
    })).resolves.toEqual({ status: "failed", stage: "cleanup", remoteCompleted: false });
    expect(onRemoved).not.toHaveBeenCalled();
  });

  it("revokes the remote session before local cleanup and clears the connection only after both succeed", async () => {
    const order: string[] = [];
    const onRemoved = vi.fn(() => order.push("connection"));
    const revokeClientSession = vi.fn(async () => { order.push("remote"); });

    await expect(removeConnectionAndOfflineData({
      expectedConnection: connection(),
      intent: "sign-out",
      namespaceKey: "account-a",
      client: null,
      connectivity: "online",
      confirm: () => true,
      onRemoved,
      inspectNamespace: async () => summary(),
      remoteSession: { client: remoteClient(revokeClientSession), clientSessionId: "session-1" },
      removeNamespace: async () => {
        order.push("namespace");
        return { status: "removed" };
      },
    })).resolves.toEqual({ status: "removed" });

    expect(order).toEqual(["remote", "namespace", "connection"]);
    expect(revokeClientSession).toHaveBeenCalledWith("session-1");
  });

  it("stops before local cleanup when remote revocation fails", async () => {
    const remoteError = new Error("remote unavailable");
    const removeNamespace = vi.fn();
    const onRemoved = vi.fn();

    await expect(removeConnectionAndOfflineData({
      expectedConnection: connection(),
      intent: "sign-out",
      namespaceKey: "account-a",
      client: null,
      connectivity: "online",
      confirm: () => true,
      onRemoved,
      inspectNamespace: async () => summary(),
      remoteSession: {
        client: remoteClient(vi.fn().mockRejectedValue(remoteError)),
        clientSessionId: "session-1",
      },
      removeNamespace,
    })).resolves.toEqual({
      status: "failed",
      stage: "remote",
      remoteCompleted: false,
      error: remoteError,
    });

    expect(removeNamespace).not.toHaveBeenCalled();
    expect(onRemoved).not.toHaveBeenCalled();
  });

  it("retains connection context when cleanup fails after remote sign-out", async () => {
    const onRemoved = vi.fn();

    await expect(removeConnectionAndOfflineData({
      expectedConnection: connection(),
      intent: "sign-out",
      namespaceKey: "account-a",
      client: null,
      connectivity: "online",
      confirm: () => true,
      onRemoved,
      inspectNamespace: async () => summary(),
      remoteSession: {
        client: remoteClient(vi.fn().mockResolvedValue(undefined)),
        clientSessionId: "session-1",
      },
      removeNamespace: async () => ({ status: "failed" }),
    })).resolves.toEqual({ status: "failed", stage: "cleanup", remoteCompleted: true });

    expect(onRemoved).not.toHaveBeenCalled();
  });

  it("does not clear a replacement connection when an older removal completes late", async () => {
    const inspection = deferred<ReturnType<typeof summary>>();
    const onRemoved = vi.fn();
    const removal = removeConnectionAndOfflineData({
      expectedConnection: connection(),
      intent: "forget",
      namespaceKey: "account-a",
      client: null,
      connectivity: "unknown",
      confirm: () => true,
      onRemoved,
      inspectNamespace: () => inspection.promise,
      removeNamespace: async () => ({ status: "removed" }),
    });
    const replacement = { ...connection(), id: "connection-b" };
    saveConnectionProfile(replacement);
    inspection.resolve(summary());

    await expect(removal).resolves.toEqual({ status: "superseded" });
    expect(onRemoved).not.toHaveBeenCalled();
  });

});

function summary(overrides: Partial<{
  pendingBooks: number;
  pendingIntents: number;
  offlineAssetCount: number;
  offlineAssetBytes: number;
}> = {}) {
  return { pendingBooks: 1, pendingIntents: 0, offlineAssetCount: 0, offlineAssetBytes: 0, ...overrides };
}

function connection(): ConnectionProfile {
  return {
    id: "connection-a",
    label: "Library",
    serverBaseUrl: "https://library.example",
    createdAt: "2026-09-15T00:00:00.000Z",
  };
}

function clientStub() {
  return { marginalia: { books: {} } } as never;
}

function remoteClient(revokeClientSession: (clientSessionId: string) => Promise<void>) {
  return { account: { revokeClientSession } } as never;
}

function outcome() {
  return {
    completedBooks: 1,
    partiallySyncedBooks: 0,
    busyBooks: 0,
    retryLaterBooks: 0,
    reauthenticateBooks: 0,
    refreshAuthorityBooks: 0,
    terminalBooks: 0,
    failedBooks: 0,
    continuationBooks: 0,
    meaningfulOutcomeBooks: 0,
    forwardedConfirmedEdits: 0,
    droppedConfirmedDeletes: 0,
    continuedLocalUpserts: 0,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}
