// @vitest-environment jsdom
import { ApiError, ApiTransportError, type CurrentUser, type SecondPassDiscovery, type SecondPassClient, type ServerInfo } from "@secondpass/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildOfflineCacheNamespace } from "../../app/offline/namespace/OfflineCacheNamespace.Policy";
import { createInMemoryOfflineRepositoryFactories } from "../offline/storage/OfflineRepositoryTest.Fixtures";
import { repairConnectionRoute } from "../../features/connection/ConnectionManualRouteRepair.Controller";
import {
  beginActiveConnectionPublication,
  clearActiveConnection,
  getActiveConnection,
  publishActiveConnectionResult,
  saveActiveConnection,
  type ActiveConnection,
} from "../../storage/ActiveConnection.Store";

const SERVER_ID = "123e4567-e89b-42d3-a456-426614174000";
const OTHER_SERVER_ID = "123e4567-e89b-42d3-a456-426614174001";
const CURRENT = "https://current.example";
const ENTERED = "https://new.example:8443";

beforeEach(() => clearActiveConnection());

describe("explicit Library route repair", () => {
  it("adopts a verified entered route without changing identity or offline ownership", async () => {
    const connection = saved();
    const namespaceBefore = namespace(connection);
    const staleWork = beginActiveConnectionPublication(connection)!;
    // The repair owns the newer publication generation; prior route work cannot publish afterward.
    const discover = vi.fn(async () => discovery(SERVER_ID.toUpperCase()));
    const loadContext = vi.fn(async (client: SecondPassClient) => {
      expect(client.config.apiRootUrl).toBe(`${ENTERED}/api/v1/`);
      expect(client.config.accessToken).toBe("token");
      return context("profile-a", [CURRENT, "https://declared.example"]);
    });
    const onConnectionChanged = vi.fn();

    await expect(repairConnectionRoute({
      connection,
      enteredUrl: `${ENTERED}/`,
      discover,
      loadContext,
      onConnectionChanged,
      now: () => "2026-09-20T00:00:00.000Z",
    })).resolves.toEqual({ status: "verified", routeChanged: true });

    const updated = getActiveConnection()!;
    expect(discover).toHaveBeenCalledExactlyOnceWith(ENTERED, undefined);
    expect(updated.serverBaseUrl).toBe(ENTERED);
    expect(updated.serverId).toBe(SERVER_ID);
    expect(updated.verifiedUser?.profileId).toBe("profile-a");
    expect(updated.id).toBe(connection.id);
    expect(updated.serverUrls).toEqual([CURRENT, "https://declared.example"]);
    expect(updated.serverUrls).not.toContain(ENTERED);
    expect(updated.clientApi?.discoveryVersion).toBe("1");
    expect(namespace(updated)).toBe(namespaceBefore);
    expect(onConnectionChanged).toHaveBeenCalledOnce();
    expect(publishActiveConnectionResult(staleWork, () => { throw new Error("Stale route published."); })).toBe(false);
  });

  it("keeps Reader work, publication bytes, covers, and projections readable after adoption", async () => {
    const connection = saved();
    const key = namespace(connection)!;
    const factories = createInMemoryOfflineRepositoryFactories();
    const projections = await factories.createProjectionRepository();
    const assets = await factories.createPublicationAssetRepository();
    const covers = await factories.createPublicationCoverRepository();
    const readerState = await factories.createReaderStateRepository();
    const outbox = await factories.createReaderOutboxRepository();
    const progress = { cfi: "epubcfi(/6/2)", percentage: 10, locationLabel: "010%" };
    await projections.put({ namespaceKey: key, projectionKey: "book:1", value: { id: "1" }, fetchedAt: 1, schemaVersion: 1 });
    await assets.putComplete({
      status: "complete", namespaceKey: key, bookId: "1", format: "epub", checksum: "a".repeat(64),
      byteLength: 1, schemaVersion: 1, payload: new Uint8Array([1]),
    });
    await covers.put({
      namespaceKey: key, bookId: "1", sourceUrl: `${CURRENT}/cover.jpg`, contentType: "image/jpeg",
      byteLength: 1, schemaVersion: 1, payload: new Uint8Array([2]),
    });
    await readerState.putBookState({
      namespaceKey: key, bookId: "1", schemaVersion: 1,
      session: { kind: "server-confirmed", localSessionId: "local:1", serverSessionId: "session:1", lastKnownServerStatus: "active" },
      progress, annotations: [], annotationRevision: 0,
    });
    await outbox.upsertIntent({
      type: "replace-progress", namespaceKey: key, bookId: "1", serverSessionId: "session:1",
      intentRevision: 1, progress,
    });

    await expect(repairConnectionRoute({
      connection, enteredUrl: ENTERED, discover: async () => discovery(), loadContext: async () => context(),
    })).resolves.toMatchObject({ status: "verified" });
    const adoptedKey = namespace(getActiveConnection()!);
    expect(adoptedKey).toBe(key);
    await expect(projections.get(adoptedKey!, "book:1")).resolves.not.toBeNull();
    await expect(assets.get(adoptedKey!, "1", "epub")).resolves.not.toBeNull();
    await expect(covers.get(adoptedKey!, "1")).resolves.not.toBeNull();
    await expect(readerState.getBookState(adoptedKey!, "1")).resolves.toMatchObject({ progress });
    await expect(outbox.list(adoptedKey!)).resolves.toHaveLength(1);
  });

  it("rejects a different server during public discovery without authenticating", async () => {
    const connection = saved();
    const loadContext = vi.fn();
    await expect(repairConnectionRoute({
      connection, enteredUrl: ENTERED, discover: async () => discovery(OTHER_SERVER_ID), loadContext,
    })).resolves.toEqual({ status: "server-mismatch" });
    expect(loadContext).not.toHaveBeenCalled();
    expect(getActiveConnection()).toEqual(connection);
  });

  it("rejects an authenticated server mismatch after matching public discovery", async () => {
    const connection = saved();
    await expect(repairConnectionRoute({
      connection, enteredUrl: ENTERED, discover: async () => discovery(),
      loadContext: async () => context("profile-a", [], OTHER_SERVER_ID),
    })).resolves.toEqual({ status: "server-mismatch" });
    expect(getActiveConnection()).toEqual(connection);
  });

  it("rejects a different profile on the same Library", async () => {
    const connection = saved();
    await expect(repairConnectionRoute({
      connection, enteredUrl: ENTERED, discover: async () => discovery(),
      loadContext: async () => context("profile-b"),
    })).resolves.toEqual({ status: "profile-mismatch" });
    expect(namespace(getActiveConnection()!)).toBe(namespace(connection));
    expect(getActiveConnection()).toEqual(connection);
  });

  it("reports rejected credentials without changing the route or repair state", async () => {
    const connection = saved();
    const denied = new ApiError({ kind: "unauthorized", status: 401, message: "Rejected" });
    await expect(repairConnectionRoute({
      connection, enteredUrl: ENTERED, discover: async () => discovery(),
      loadContext: async () => { throw denied; },
    })).resolves.toEqual({ status: "authorization-failed", authenticationRejected: true });
    expect(getActiveConnection()).toEqual(connection);
  });

  it("keeps authorization denial distinct from rejected credentials", async () => {
    const connection = saved();
    const denied = new ApiError({ kind: "forbidden", status: 403, message: "Forbidden" });
    await expect(repairConnectionRoute({
      connection, enteredUrl: ENTERED, discover: async () => discovery(),
      loadContext: async () => { throw denied; },
    })).resolves.toEqual({ status: "authorization-failed", authenticationRejected: false });
    expect(getActiveConnection()).toEqual(connection);
  });

  it("keeps the saved connection when the entered route is unreachable", async () => {
    const connection = saved();
    await expect(repairConnectionRoute({
      connection, enteredUrl: ENTERED,
      discover: async () => { throw new ApiTransportError(new TypeError("Failed to fetch")); },
    })).resolves.toEqual({ status: "unavailable" });
    expect(getActiveConnection()).toEqual(connection);
  });

  it("rejects a subpath before making a network request", async () => {
    const connection = saved();
    const discover = vi.fn();
    await expect(repairConnectionRoute({ connection, enteredUrl: `${ENTERED}/library`, discover }))
      .resolves.toMatchObject({ status: "invalid-url" });
    expect(discover).not.toHaveBeenCalled();
    expect(getActiveConnection()).toEqual(connection);
  });

  it("cannot publish after a newer connection generation takes ownership", async () => {
    const connection = saved();
    const pending = deferred<SecondPassDiscovery>();
    const running = repairConnectionRoute({ connection, enteredUrl: ENTERED, discover: () => pending.promise });
    const replacement = { ...connection, serverBaseUrl: "https://newer.example" };
    saveActiveConnection(replacement);
    pending.resolve(discovery());
    await expect(running).resolves.toEqual({ status: "stale" });
    expect(getActiveConnection()).toEqual(replacement);
  });

  it("does not publish a cancelled attempt even when its request ignores abort", async () => {
    const connection = saved();
    const cancel = new AbortController();
    const pending = deferred<SecondPassDiscovery>();
    const discover = vi.fn((_route: string, signal?: AbortSignal) => {
      expect(signal).toBe(cancel.signal);
      return pending.promise;
    });
    const running = repairConnectionRoute({ connection, enteredUrl: ENTERED, signal: cancel.signal, discover });
    cancel.abort();
    pending.resolve(discovery());
    await expect(running).resolves.toEqual({ status: "stale" });
    expect(getActiveConnection()).toEqual(connection);
  });
});

function saved(): ActiveConnection {
  const connection: ActiveConnection = {
    id: "connection-a", label: "Library", serverBaseUrl: CURRENT, serverId: SERVER_ID,
    serverUrls: [], accessToken: "token", verifiedAt: "2026-09-14T00:00:00.000Z",
    verifiedUser: { profileId: "profile-a", username: "reader" }, createdAt: "2026-09-14T00:00:00.000Z",
  };
  saveActiveConnection(connection);
  return connection;
}

function namespace(connection: ActiveConnection): string | undefined {
  return buildOfflineCacheNamespace({ serverId: connection.serverId, profileId: connection.verifiedUser?.profileId })?.key;
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

function context(profileId = "profile-a", serverUrls: string[] = [], serverId = SERVER_ID): { currentUser: CurrentUser; serverInfo: ServerInfo } {
  return {
    currentUser: {
      profileId, username: "reader", email: "reader@example.test", firstName: "Read", lastName: "Er",
      role: "reader", mustChangePassword: false, isOwner: false, isManager: false, isLibrarian: false,
      isReader: true, canAccessDjangoAdmin: false, groups: [],
    },
    serverInfo: {
      serverId, serverUrls, name: "Library", description: "", bannerText: "",
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
