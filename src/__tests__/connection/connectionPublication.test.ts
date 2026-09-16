// @vitest-environment jsdom
import { ApiError, type CurrentUser, type ServerInfo } from "@secondpass/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyConnection } from "../../features/connection/ConnectionVerification.Controller";
import {
  beginActiveConnectionPublication,
  clearActiveConnection,
  getActiveConnection,
  publishActiveConnectionResult,
  saveActiveConnection,
  type ActiveConnection,
} from "../../storage/ActiveConnection.Store";

describe("active connection publication ownership", () => {
  beforeEach(() => clearActiveConnection());

  it("lets a newer operation supersede older work for the same connection record", () => {
    const connection = profile("connection-a", "token-a");
    saveActiveConnection(connection);
    const older = beginActiveConnectionPublication(connection)!;
    const newer = beginActiveConnectionPublication(connection)!;
    const olderPublish = vi.fn();
    const newerPublish = vi.fn();

    expect(publishActiveConnectionResult(older, olderPublish)).toBe(false);
    expect(publishActiveConnectionResult(newer, newerPublish)).toBe(true);
    expect(olderPublish).not.toHaveBeenCalled();
    expect(newerPublish).toHaveBeenCalledOnce();
  });

  it("rejects publication after a different active connection replaces the captured record", () => {
    const first = profile("connection-a", "token-a");
    saveActiveConnection(first);
    const publication = beginActiveConnectionPublication(first)!;
    saveActiveConnection(profile("connection-b", "token-b"));

    expect(publishActiveConnectionResult(publication, vi.fn())).toBe(false);
    expect(getActiveConnection()?.id).toBe("connection-b");
  });
});

describe("connection verification publication", () => {
  beforeEach(() => clearActiveConnection());

  it("publishes an ordinary current verification", async () => {
    const connection = profile("connection-a", "token-a");
    saveActiveConnection(connection);

    await expect(verifyConnection({
      connection,
      createClient: () => ({}) as never,
      loadContext: async () => context("profile-a"),
      now: () => "2026-09-15T01:00:00.000Z",
    })).resolves.toMatchObject({ status: "verified" });

    expect(getActiveConnection()).toMatchObject({
      id: "connection-a",
      verifiedAt: "2026-09-15T01:00:00.000Z",
      verifiedUser: { profileId: "profile-a" },
    });
  });

  it("does not restore a connection removed while verification is pending", async () => {
    const connection = profile("connection-a", "token-a");
    const pending = deferred<ReturnType<typeof context>>();
    saveActiveConnection(connection);
    const verification = verifyConnection({
      connection,
      createClient: () => ({}) as never,
      loadContext: () => pending.promise,
    });

    clearActiveConnection();
    pending.resolve(context("profile-a"));

    await expect(verification).resolves.toEqual({ status: "stale" });
    expect(getActiveConnection()).toBeNull();
  });

  it("lets a newer verification supersede older work for the same logical server", async () => {
    const connection = profile("connection-a", "token-a");
    const olderContext = deferred<ReturnType<typeof context>>();
    const newerContext = deferred<ReturnType<typeof context>>();
    saveActiveConnection(connection);
    const older = verifyConnection({
      connection,
      createClient: () => ({}) as never,
      loadContext: () => olderContext.promise,
    });
    const newer = verifyConnection({
      connection,
      createClient: () => ({}) as never,
      loadContext: () => newerContext.promise,
    });

    olderContext.resolve(context("profile-old"));
    await expect(older).resolves.toEqual({ status: "stale" });
    newerContext.resolve(context("profile-new"));
    await expect(newer).resolves.toMatchObject({ status: "verified" });
    expect(getActiveConnection()?.verifiedUser?.profileId).toBe("profile-new");
  });

  it("does not put a replacement connection into repair after stale authorization failure", async () => {
    const first = profile("connection-a", "token-a");
    const replacement = profile("connection-b", "token-b");
    const pending = deferred<ReturnType<typeof context>>();
    saveActiveConnection(first);
    const verification = verifyConnection({
      connection: first,
      createClient: () => ({}) as never,
      loadContext: () => pending.promise,
    });

    saveActiveConnection(replacement);
    pending.reject(new ApiError({ kind: "unauthorized", status: 401, message: "Rejected" }));

    await expect(verification).resolves.toEqual({ status: "stale" });
    expect(getActiveConnection()).toEqual(replacement);
  });

  it("does not activate a stale repair completion after replacement", async () => {
    const repairing = {
      ...profile("connection-a", "replacement-token"),
      authenticationState: "verifying-repair" as const,
      verifiedAt: "2026-09-14T00:00:00.000Z",
      verifiedUser: { profileId: "profile-old", username: "reader" },
    };
    const replacement = profile("connection-b", "token-b");
    const cleanup = deferred<void>();
    const finalizeStarted = vi.fn();
    saveActiveConnection(repairing);
    const verification = verifyConnection({
      connection: repairing,
      createClient: () => ({}) as never,
      loadContext: async () => context("profile-new"),
      finalizeRepair: async (input) => {
        finalizeStarted();
        await cleanup.promise;
        input.save(input.verified);
        return { status: "saved", identity: "different" };
      },
    });
    await vi.waitFor(() => expect(finalizeStarted).toHaveBeenCalledOnce());

    saveActiveConnection(replacement);
    cleanup.resolve();

    await expect(verification).resolves.toEqual({ status: "stale" });
    expect(getActiveConnection()).toEqual(replacement);
  });

  it("returns a current repair rejection to repair-required state", async () => {
    const repairing = {
      ...profile("connection-a", "replacement-token"),
      authenticationState: "verifying-repair" as const,
    };
    saveActiveConnection(repairing);

    await expect(verifyConnection({
      connection: repairing,
      createClient: () => ({}) as never,
      loadContext: async () => {
        throw new ApiError({ kind: "unauthorized", status: 401, message: "Rejected" });
      },
    })).resolves.toEqual({ status: "authorization-failed", authenticationRejected: true });
    expect(getActiveConnection()?.authenticationState).toBe("repair-required");
  });
});

function profile(id: string, accessToken: string): ActiveConnection {
  return {
    id,
    label: "Library",
    serverBaseUrl: "https://library.example",
    apiBaseUrl: "https://library.example/api/v1",
    accessToken,
    createdAt: "2026-09-15T00:00:00.000Z",
  };
}

function context(profileId: string): { currentUser: CurrentUser; serverInfo: ServerInfo } {
  return {
    currentUser: {
      profileId,
      username: "reader",
      email: "reader@example.test",
      firstName: "Read",
      lastName: "Er",
      role: "reader",
      mustChangePassword: false,
      isOwner: false,
      isManager: false,
      isLibrarian: false,
      isReader: true,
      canAccessDjangoAdmin: false,
      groups: [],
    },
    serverInfo: {
      name: "Library",
      description: "",
      bannerText: "",
      advancedLibraryGroupsEnabled: false,
      readingClientBaseUrl: "https://library.example",
      marginaliaProfileUri: "https://library.example/profile",
      publicGroup: { id: "public", name: "Public", description: "" },
      version: "1",
      releaseDate: "2026-09-15",
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}
