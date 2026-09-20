// @vitest-environment jsdom
import { ApiError, ApiTransportError, type CurrentUser, type SecondPassDiscovery, type SecondPassClient, type ServerInfo } from "@secondpass/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildOfflineCacheNamespace } from "../../app/offline/namespace/OfflineCacheNamespace.Policy";
import {
  isRouteTransportFailure,
  orderedConnectionRoutes,
  recoverConnectionRoute,
} from "../../features/connection/ConnectionRouteRecovery.Controller";
import { clearActiveConnection, getActiveConnection, saveActiveConnection, type ActiveConnection } from "../../storage/ActiveConnection.Store";

const SERVER_ID = "123e4567-e89b-42d3-a456-426614174000";
const OTHER_SERVER_ID = "123e4567-e89b-42d3-a456-426614174001";
const CURRENT = "https://current.example";
const FIRST = "https://first.example";
const SECOND = "https://second.example";

beforeEach(() => clearActiveConnection());

describe("saved Library route recovery", () => {
  it("keeps a working current route and does not discover alternates", async () => {
    const connection = saved();
    const discover = vi.fn();
    const loadContext = vi.fn(async () => context());
    const result = await recoverConnectionRoute({ connection, discover, loadContext });

    expect(result).toMatchObject({ status: "verified", routeChanged: false });
    expect(loadContext).toHaveBeenCalledOnce();
    expect(discover).not.toHaveBeenCalled();
    expect(getActiveConnection()?.serverBaseUrl).toBe(CURRENT);
  });

  it("adopts the first verified alternate while retaining offline identity", async () => {
    const connection = saved();
    const before = namespace(connection);
    const discover = vi.fn(async () => discovery());
    const loadContext = vi.fn(async (client: SecondPassClient) => {
      if (routeOf(client) === CURRENT) throw transportFailure();
      return context();
    });
    const onConnectionChanged = vi.fn();

    await expect(recoverConnectionRoute({ connection, discover, loadContext, onConnectionChanged }))
      .resolves.toMatchObject({ status: "verified", routeChanged: true });
    expect(discover).toHaveBeenCalledExactlyOnceWith(FIRST);
    expect(loadContext.mock.calls.map(([client]) => routeOf(client))).toEqual([CURRENT, FIRST]);
    expect(getActiveConnection()?.serverBaseUrl).toBe(FIRST);
    expect(namespace(getActiveConnection()!)).toBe(before);
    expect(onConnectionChanged).toHaveBeenCalledOnce();
  });

  it("tries declared alternates sequentially in operator order", async () => {
    const connection = saved();
    const discover = vi.fn(async (route: string) => {
      if (route === FIRST) throw transportFailure();
      return discovery();
    });
    const loadContext = vi.fn(async (client: SecondPassClient) => {
      if (routeOf(client) === CURRENT) throw transportFailure();
      return context();
    });

    await expect(recoverConnectionRoute({ connection, discover, loadContext }))
      .resolves.toMatchObject({ status: "verified", routeChanged: true });
    expect(discover.mock.calls.map(([route]) => route)).toEqual([FIRST, SECOND]);
    expect(getActiveConnection()?.serverBaseUrl).toBe(SECOND);
  });

  it("rejects a different Library ID at one alternate and continues", async () => {
    const connection = saved();
    const discover = vi.fn(async (route: string) => discovery(route === FIRST ? OTHER_SERVER_ID : SERVER_ID));
    const loadContext = vi.fn(async (client: SecondPassClient) => {
      if (routeOf(client) === CURRENT) throw transportFailure();
      return context();
    });

    await expect(recoverConnectionRoute({ connection, discover, loadContext }))
      .resolves.toMatchObject({ status: "verified", routeChanged: true });
    expect(loadContext.mock.calls.map(([client]) => routeOf(client))).toEqual([CURRENT, SECOND]);
    expect(getActiveConnection()?.serverBaseUrl).toBe(SECOND);
  });

  it("rejects an alternate whose authenticated account differs", async () => {
    const connection = saved([FIRST]);
    const loadContext = vi.fn(async (client: SecondPassClient) => {
      if (routeOf(client) === CURRENT) throw transportFailure();
      return context("another-profile");
    });

    await expect(recoverConnectionRoute({ connection, discover: async () => discovery(), loadContext }))
      .resolves.toEqual({ status: "unavailable", mismatchedCandidates: 1 });
    expect(getActiveConnection()).toEqual(connection);
  });

  it("rejects an alternate whose authenticated server ID disagrees with discovery", async () => {
    const connection = saved([FIRST]);
    const loadContext = vi.fn(async (client: SecondPassClient) => {
      if (routeOf(client) === CURRENT) throw transportFailure();
      const verified = context();
      return { ...verified, serverInfo: { ...verified.serverInfo, serverId: OTHER_SERVER_ID } };
    });

    await expect(recoverConnectionRoute({ connection, discover: async () => discovery(), loadContext }))
      .resolves.toEqual({ status: "unavailable", mismatchedCandidates: 1 });
    expect(getActiveConnection()).toEqual(connection);
  });

  it("stops on authorization failure without probing later routes", async () => {
    const connection = saved();
    const denied = new ApiError({ kind: "unauthorized", status: 401, message: "Rejected" });
    const discover = vi.fn(async () => discovery());
    const loadContext = vi.fn(async (client: SecondPassClient) => {
      if (routeOf(client) === CURRENT) throw transportFailure();
      throw denied;
    });

    await expect(recoverConnectionRoute({ connection, discover, loadContext }))
      .resolves.toMatchObject({ status: "authorization-failed", authenticationRejected: true });
    expect(discover).toHaveBeenCalledExactlyOnceWith(FIRST);
    expect(getActiveConnection()).toEqual(connection);
  });

  it("keeps the saved connection when all routes are unreachable", async () => {
    const connection = saved();
    const discover = vi.fn(async (_route: string) => { throw transportFailure(); });
    const result = await recoverConnectionRoute({
      connection,
      discover,
      loadContext: async () => { throw transportFailure(); },
    });

    expect(result).toEqual({ status: "unavailable", mismatchedCandidates: 0 });
    expect(discover.mock.calls.map(([route]) => route)).toEqual([FIRST, SECOND]);
    expect(getActiveConnection()).toEqual(connection);
  });

  it("cannot publish a late alternate after another connection takes ownership", async () => {
    const connection = saved();
    const gate = deferred<SecondPassDiscovery>();
    const discover = vi.fn(() => gate.promise);
    const loadContext = vi.fn(async () => { throw transportFailure(); });
    const running = recoverConnectionRoute({ connection, discover, loadContext });
    await vi.waitFor(() => expect(discover).toHaveBeenCalledOnce());
    const replacement = { ...connection, serverBaseUrl: "https://newer.example" };
    saveActiveConnection(replacement);
    gate.resolve(discovery());

    await expect(running).resolves.toEqual({ status: "stale" });
    expect(getActiveConnection()).toEqual(replacement);
  });

  it("replaces declared routes with the authenticated response in its exact order", async () => {
    const connection = saved();
    const refreshed = [SECOND, FIRST, CURRENT];
    const loadContext = vi.fn(async (client: SecondPassClient) => {
      if (routeOf(client) === CURRENT) throw transportFailure();
      return context("profile-a", refreshed);
    });

    await recoverConnectionRoute({ connection, discover: async () => discovery(), loadContext });
    expect(getActiveConnection()?.serverUrls).toEqual(refreshed);
  });

  it("refreshes declared order even when the current route still works", async () => {
    const connection = saved();
    const refreshed = [SECOND, CURRENT, FIRST];
    const discover = vi.fn();
    await recoverConnectionRoute({ connection, discover, loadContext: async () => context("profile-a", refreshed) });

    expect(discover).not.toHaveBeenCalled();
    expect(getActiveConnection()?.serverBaseUrl).toBe(CURRENT);
    expect(getActiveConnection()?.serverUrls).toEqual(refreshed);
  });

  it("normalizes only for route equality and never probes duplicates twice", async () => {
    const connection = saved([`${CURRENT}/`, FIRST, `${FIRST}/`, SECOND]);
    const discover = vi.fn(async (_route: string) => { throw transportFailure(); });
    expect(orderedConnectionRoutes(connection)).toEqual([CURRENT, FIRST, SECOND]);

    await recoverConnectionRoute({
      connection,
      discover,
      loadContext: async () => { throw transportFailure(); },
    });
    expect(discover.mock.calls.map(([route]) => route)).toEqual([FIRST, SECOND]);
  });

  it("does not probe alternates after reached-server errors", async () => {
    const connection = saved();
    const discover = vi.fn();
    const error = new ApiError({ kind: "http_error", status: 500, message: "Server failed" });
    await expect(recoverConnectionRoute({
      connection,
      discover,
      loadContext: async () => { throw error; },
    })).resolves.toEqual({ status: "failed", error });
    expect(discover).not.toHaveBeenCalled();
    expect(isRouteTransportFailure(error)).toBe(false);
    expect(isRouteTransportFailure(transportFailure())).toBe(true);
    expect(isRouteTransportFailure(new TypeError("Malformed response"))).toBe(false);
  });

  it("does not fail over when parsing a reached response throws TypeError", async () => {
    const connection = saved();
    const discover = vi.fn();
    const error = new TypeError("Malformed response");
    await expect(recoverConnectionRoute({
      connection,
      discover,
      loadContext: async () => { throw error; },
    })).resolves.toEqual({ status: "failed", error });
    expect(discover).not.toHaveBeenCalled();
  });

  it("moves to the next route when a probe does not settle within the bound", async () => {
    vi.useFakeTimers();
    try {
      const connection = saved([FIRST]);
      const discover = vi.fn(async () => discovery());
      const loadContext = vi.fn(async (client: SecondPassClient) => {
        if (routeOf(client) === CURRENT) return new Promise<ReturnType<typeof context>>(() => undefined);
        return context();
      });
      const running = recoverConnectionRoute({ connection, discover, loadContext });
      await vi.advanceTimersByTimeAsync(10_000);

      await expect(running).resolves.toMatchObject({ status: "verified", routeChanged: true });
      expect(discover).toHaveBeenCalledExactlyOnceWith(FIRST);
    } finally {
      vi.useRealTimers();
    }
  });
});

function saved(serverUrls = [FIRST, SECOND]): ActiveConnection {
  const connection: ActiveConnection = {
    id: "connection-a", label: "Library", serverBaseUrl: CURRENT, serverId: SERVER_ID,
    serverUrls, accessToken: "token", verifiedAt: "2026-09-14T00:00:00.000Z",
    verifiedUser: { profileId: "profile-a", username: "reader" }, createdAt: "2026-09-14T00:00:00.000Z",
  };
  saveActiveConnection(connection);
  return connection;
}

function routeOf(client: SecondPassClient): string {
  return client.config.apiRootUrl.replace(/\/api\/v1\/$/, "");
}

function namespace(connection: ActiveConnection): string | undefined {
  return buildOfflineCacheNamespace({ serverId: connection.serverId, profileId: connection.verifiedUser?.profileId })?.key;
}

function transportFailure(): ApiTransportError {
  return new ApiTransportError(new TypeError("Failed to fetch"));
}

function discovery(serverId = SERVER_ID): SecondPassDiscovery {
  return {
    serverId, server_name: "Library", server_description: "", server_version: "1", server_release_date: "2026-09-14",
    client_api: {
      discovery_version: "1", login_request_endpoint: "/login-requests/",
      poll_endpoint_template: "/poll/{id}/", consume_endpoint_template: "/consume/{id}/", token_type: "Bearer",
    },
  };
}

function context(profileId = "profile-a", serverUrls = [FIRST, SECOND]): { currentUser: CurrentUser; serverInfo: ServerInfo } {
  return {
    currentUser: {
      profileId, username: "reader", email: "reader@example.test", firstName: "Read", lastName: "Er",
      role: "reader", mustChangePassword: false, isOwner: false, isManager: false, isLibrarian: false,
      isReader: true, canAccessDjangoAdmin: false, groups: [],
    },
    serverInfo: {
      serverId: SERVER_ID, serverUrls, name: "Library", description: "", bannerText: "",
      advancedLibraryGroupsEnabled: false, readingClientBaseUrl: CURRENT,
      marginaliaProfileUri: `${CURRENT}/profile`, publicGroup: { id: "public", name: "Public", description: "" },
      version: "1", releaseDate: "2026-09-14",
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}
