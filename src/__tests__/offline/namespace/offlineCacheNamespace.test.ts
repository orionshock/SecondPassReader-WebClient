import { describe, expect, it } from "vitest";
import { buildOfflineCacheNamespace } from "../../../app/offline/namespace/OfflineCacheNamespace.Policy";

const SERVER_A = "123e4567-e89b-42d3-a456-426614174000";
const SERVER_B = "123e4567-e89b-42d3-a456-426614174001";

describe("offline cache namespace", () => {
  it("serializes verified Library and profile identity deterministically", () => {
    expect(buildOfflineCacheNamespace({ serverId: SERVER_A, profileId: " reader/1 " })).toEqual({
      serverId: SERVER_A,
      profileId: "reader/1",
      key: `server:${SERVER_A}|profile:reader%2F1`,
    });
    expect(buildOfflineCacheNamespace({ serverId: SERVER_A.toUpperCase(), profileId: "reader/1" }))
      .toEqual(buildOfflineCacheNamespace({ serverId: SERVER_A, profileId: "reader/1" }));
  });

  it("keeps the key across route, token, and display metadata changes", () => {
    const before = {
      serverId: SERVER_A,
      profileId: "profile-1",
      serverBaseUrl: "https://first.example",
      accessToken: "old-token",
      serverName: "Old Name",
    };
    const after = {
      ...before,
      serverBaseUrl: "https://second.example",
      accessToken: "new-token",
      serverName: "New Name",
    };
    const identity = (connection: typeof before) => buildOfflineCacheNamespace({
      serverId: connection.serverId,
      profileId: connection.profileId,
    });
    expect(identity(after)).toEqual(identity(before));
  });

  it("separates different Libraries even at the same route with the same profile ID", () => {
    expect(buildOfflineCacheNamespace({ serverId: SERVER_A, profileId: "profile-1" })?.key)
      .not.toBe(buildOfflineCacheNamespace({ serverId: SERVER_B, profileId: "profile-1" })?.key);
  });

  it("separates different profiles at one Library", () => {
    expect(buildOfflineCacheNamespace({ serverId: SERVER_A, profileId: "profile-1" })?.key)
      .not.toBe(buildOfflineCacheNamespace({ serverId: SERVER_A, profileId: "profile-2" })?.key);
  });

  it.each([
    { serverId: undefined, profileId: "profile-1" },
    { serverId: "not-a-uuid", profileId: "profile-1" },
    { serverId: SERVER_A, profileId: undefined },
    { serverId: SERVER_A, profileId: "  " },
  ])("rejects incomplete identity: $serverId / $profileId", (input) => {
    expect(buildOfflineCacheNamespace(input)).toBeNull();
  });
});
