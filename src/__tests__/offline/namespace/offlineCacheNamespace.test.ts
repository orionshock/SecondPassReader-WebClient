import { describe, expect, it } from "vitest";
import { buildOfflineCacheNamespace } from "../../../app/offline/namespace/OfflineCacheNamespace.Policy";

describe("offline cache namespace", () => {
  it("remains stable across token and display metadata refreshes", () => {
    const before = {
      serverBaseUrl: "https://library.example",
      accountProfileId: "profile-1",
      accessToken: "old-token",
      serverName: "Old Name",
      serverDescription: "Old description",
      serverVersion: "1.0",
    };
    const after = {
      ...before,
      accessToken: "new-token",
      serverName: "New Name",
      serverDescription: "New description",
      serverVersion: "2.0",
    };

    expect(buildOfflineCacheNamespace(after)).toEqual(buildOfflineCacheNamespace(before));
  });

  it("separates servers that report the same account profile ID", () => {
    const first = buildOfflineCacheNamespace({
      serverBaseUrl: "https://one.example",
      accountProfileId: "profile-1",
    });
    const second = buildOfflineCacheNamespace({
      serverBaseUrl: "https://two.example",
      accountProfileId: "profile-1",
    });

    expect(first?.key).not.toBe(second?.key);
  });

  it("separates account profiles on the same server", () => {
    const first = buildOfflineCacheNamespace({
      serverBaseUrl: "https://library.example",
      accountProfileId: "profile-1",
    });
    const second = buildOfflineCacheNamespace({
      serverBaseUrl: "https://library.example",
      accountProfileId: "profile-2",
    });

    expect(first?.key).not.toBe(second?.key);
  });

  it.each([
    { serverBaseUrl: undefined, accountProfileId: "profile-1" },
    { serverBaseUrl: "https://library.example", accountProfileId: undefined },
    { serverBaseUrl: "https://library.example", accountProfileId: "  " },
    { serverBaseUrl: "not a URL", accountProfileId: "profile-1" },
  ])("rejects incomplete or invalid identity: $serverBaseUrl / $accountProfileId", (input) => {
    expect(buildOfflineCacheNamespace(input)).toBeNull();
  });

  it("normalizes host casing, default ports, and trailing slashes", () => {
    const canonical = buildOfflineCacheNamespace({
      serverBaseUrl: "https://library.example",
      accountProfileId: "profile-1",
    });
    const equivalent = buildOfflineCacheNamespace({
      serverBaseUrl: " HTTPS://LIBRARY.EXAMPLE:443/ ",
      accountProfileId: " profile-1 ",
    });

    expect(equivalent).toEqual(canonical);
    expect(canonical).toEqual({
      serverOrigin: "https://library.example",
      accountProfileId: "profile-1",
      key: "server:https%3A%2F%2Flibrary.example|profile:profile-1",
    });
  });

  it("uses the origin when a URL contains a path", () => {
    const origin = buildOfflineCacheNamespace({
      serverBaseUrl: "https://library.example",
      accountProfileId: "profile-1",
    });
    const withPath = buildOfflineCacheNamespace({
      serverBaseUrl: "https://library.example/unsupported/path/",
      accountProfileId: "profile-1",
    });

    expect(withPath).toEqual(origin);
  });
});
