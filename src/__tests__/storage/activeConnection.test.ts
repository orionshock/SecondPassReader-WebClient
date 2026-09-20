// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearActiveConnection,
  getActiveConnection,
  saveActiveConnection,
  type ActiveConnection,
} from "../../storage/ActiveConnection.Store";

const STORAGE_KEY = "secondpass.activeConnection.v1";

describe("active connection persistence", () => {
  beforeEach(() => clearActiveConnection());

  it("round-trips valid unverified and fully verified records", () => {
    const unverified = connection();
    saveActiveConnection(unverified);
    expect(getActiveConnection()).toEqual(unverified);

    const verified: ActiveConnection = {
      ...unverified,
      serverName: "Library",
      serverUrls: ["https://library.example:8443", "https://library.example"],
      serverDescription: "Description",
      serverVersion: "1.2.3",
      serverReleaseDate: "2026-09-15",
      advancedLibraryGroupsEnabled: true,
      bannerText: null,
      readingClientBaseUrl: "https://library.example/reader",
      marginaliaProfileUri: "https://library.example/profile",
      publicGroup: { id: "public", name: "Public", description: "" },
      accessToken: "secret-token",
      tokenType: "Token",
      clientSessionId: "session-1",
      clientSessionName: "Browser",
      linkedAt: "2026-09-15T01:00:00.000Z",
      verifiedAt: "2026-09-15T01:01:00.000Z",
      verifiedUser: {
        profileId: "profile-1",
        username: "reader",
        displayName: "Reader",
        email: "reader@example.test",
        role: "reader",
        isOwner: false,
        isManager: false,
        isLibrarian: false,
        isReader: true,
        canAccessDjangoAdmin: false,
        groups: [{ id: "group-1", name: "Readers", isPublicGroup: true, isCurator: false }],
      },
      mustChangePassword: false,
      clientApi: {
        discoveryVersion: "1",
        loginRequestEndpoint: "/login",
        pollEndpointTemplate: "/poll/{id}",
        consumeEndpointTemplate: "/consume/{id}",
        tokenType: "Token",
      },
      lastUsedAt: "2026-09-15T01:02:00.000Z",
      lastCheckedAt: "2026-09-15T01:03:00.000Z",
    };
    saveActiveConnection(verified);
    expect(getActiveConnection()).toEqual(verified);
  });

  it.each([
    ["token metadata", { accessToken: { secret: true } }],
    ["authentication state", { authenticationState: "broken" }],
    ["verified user", { verifiedUser: { username: "reader", groups: [{ id: "g", name: "G", isPublicGroup: "yes", isCurator: false }] } }],
    ["server metadata", { publicGroup: { id: "public", name: "Public" } }],
    ["client session metadata", { clientSessionId: 42 }],
    ["Client API metadata", { clientApi: { discoveryVersion: "1", loginRequestEndpoint: "/login" } }],
    ["timestamp metadata", { lastCheckedAt: "not-a-time" }],
    ["required identity", { id: "" }],
    ["server ID", { serverId: "not-a-uuid" }],
    ["current route", { serverBaseUrl: "https://library.example/path" }],
    ["route list", { serverUrls: ["https://library.example", "javascript:alert(1)"] }],
  ])("ignores a persisted record with malformed %s", (_label, malformed) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...connection(), ...malformed }));

    expect(getActiveConnection()).toBeNull();
  });
});

function connection(): ActiveConnection {
  return {
    id: "connection-1",
    label: "Library",
    serverBaseUrl: "https://library.example",
    serverId: "123e4567-e89b-42d3-a456-426614174000",
    serverUrls: [],
    createdAt: "2026-09-15T00:00:00.000Z",
  };
}
