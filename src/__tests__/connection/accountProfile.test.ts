import { describe, expect, it } from "vitest";
import type { CurrentUser, ServerInfo } from "@secondpass/client";
import {
  applyAuthenticatedContextToProfile,
  applyCurrentAccountToProfile,
  hasCurrentAccountProfileChanged,
} from "../../features/connection/ConnectionAccountProfile.Mapper";
import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";

function baseProfile(): ConnectionProfile {
  return {
    id: "local-1",
    label: "Discovery Name",
    serverBaseUrl: "https://server.example",
    apiBaseUrl: "https://api.example",
    serverName: "Discovery Name",
    accessToken: "token",
    createdAt: "2026-06-25T00:00:00.000Z",
  };
}

describe("accountProfile", () => {
  it("stores identity from /accounts/me and display/config from /server/info", () => {
    const next = applyAuthenticatedContextToProfile(
      baseProfile(),
      currentUser({
        username: "orionshock",
        email: "orionshock@gmail.com",
        firstName: "Apollo",
        lastName: "Shockman",
        profileId: "profile-1",
        role: "manager",
        isOwner: true,
        groups: [
          { id: "public", name: "Common Room", isPublicGroup: true, isCurator: false },
          { id: "club", name: "Fantasy Club", isPublicGroup: false, isCurator: true },
        ],
      }),
      serverInfo({
        name: "Authenticated Library Name",
        description: "Authenticated description",
        bannerText: "Maintenance tonight",
        advancedLibraryGroupsEnabled: true,
      }),
      "2026-06-25T12:00:00.000Z",
    );

    expect(next.verifiedAt).toBe("2026-06-25T12:00:00.000Z");
    expect(next.serverName).toBe("Authenticated Library Name");
    expect(next.serverDescription).toBe("Authenticated description");
    expect(next.advancedLibraryGroupsEnabled).toBe(true);
    expect(next.bannerText).toBe("Maintenance tonight");
    expect(next.publicGroup).toEqual({ id: "public", name: "Common Room", description: "Public catalog" });
    expect(next.verifiedUser).toMatchObject({
      profileId: "profile-1",
      username: "orionshock",
      firstName: "Apollo",
      lastName: "Shockman",
      role: "manager",
      isOwner: true,
      groups: [
        { id: "public", name: "Common Room", isPublicGroup: true, isCurator: false },
        { id: "club", name: "Fantasy Club", isPublicGroup: false, isCurator: true },
      ],
    });
  });

  it("does not change server configuration when only /accounts/me is applied", () => {
    const profile = { ...baseProfile(), advancedLibraryGroupsEnabled: true, bannerText: "Server banner" };
    const next = applyCurrentAccountToProfile(profile, currentUser(), "2026-06-25T12:00:00.000Z");

    expect(next.advancedLibraryGroupsEnabled).toBe(true);
    expect(next.bannerText).toBe("Server banner");
  });

  it("detects account and authenticated server-context changes", () => {
    const profile = applyAuthenticatedContextToProfile(
      baseProfile(),
      currentUser({ role: "reader", isReader: true }),
      serverInfo({ advancedLibraryGroupsEnabled: false }),
      "2026-06-25T12:00:00.000Z",
    );
    const next = applyAuthenticatedContextToProfile(
      profile,
      currentUser({ role: "manager", isManager: true }),
      serverInfo({ advancedLibraryGroupsEnabled: true }),
      "2026-06-25T13:00:00.000Z",
      { markVerified: false },
    );

    expect(hasCurrentAccountProfileChanged(profile, next)).toBe(true);
    expect(next.advancedLibraryGroupsEnabled).toBe(true);
  });
});

function currentUser(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    username: "reader",
    email: "reader@example.com",
    firstName: "Read",
    lastName: "Er",
    profileId: "profile-1",
    role: "reader",
    mustChangePassword: false,
    isOwner: false,
    isManager: false,
    isLibrarian: false,
    isReader: true,
    canAccessDjangoAdmin: false,
    groups: [],
    ...overrides,
  };
}

function serverInfo(overrides: Partial<ServerInfo> = {}): ServerInfo {
  return {
    name: "Authenticated Library",
    description: "Library description",
    bannerText: "",
    advancedLibraryGroupsEnabled: false,
    readingClientBaseUrl: "https://reader.example",
    marginaliaProfileUri: "https://example.test/profiles/marginalia",
    publicGroup: { id: "public", name: "Common Room", description: "Public catalog" },
    version: "2.4.0",
    releaseDate: "2026-08-01",
    ...overrides,
  };
}
