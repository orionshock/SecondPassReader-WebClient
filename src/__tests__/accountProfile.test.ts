import { describe, expect, it } from "vitest";
import { applyCurrentAccountToProfile, hasCurrentAccountProfileChanged } from "../features/connection/accountProfile";
import type { ConnectionProfile } from "../storage/connectionProfiles";

function baseProfile(): ConnectionProfile {
  return {
    id: "local-1",
    label: "Local",
    serverBaseUrl: "https://server.example",
    apiBaseUrl: "https://api.example",
    accessToken: "token",
    createdAt: "2026-06-25T00:00:00.000Z",
  };
}

describe("accountProfile", () => {
  it("maps the current /accounts/me payload into the persisted connection profile", () => {
    const next = applyCurrentAccountToProfile(baseProfile(), {
      username: "orionshock",
      email: "orionshock@gmail.com",
      first_name: "Apollo",
      last_name: "Shockman",
      profile_id: "f241b2c7-414e-4fc0-9623-dbea4a1cf449",
      role: "manager",
      must_change_password: false,
      is_owner: true,
      advanced_library_groups_enabled: true,
      banner_text: "Maintenance tonight",
      groups: [
        {
          id: "8ad00b1e-e108-4ad2-a0b4-1d5c465083c7",
          name: "Common Room",
          is_public_group: true,
          is_curator: false,
        },
        {
          id: "c7309a6d-3559-43eb-a5f0-0bf9eb83dcd0",
          name: "Fantasy Club",
          is_public_group: false,
          is_curator: true,
        },
      ],
    }, "2026-06-25T12:00:00.000Z");

    expect(next.verifiedAt).toBe("2026-06-25T12:00:00.000Z");
    expect(next.mustChangePassword).toBe(false);
    expect(next.advancedLibraryGroupsEnabled).toBe(true);
    expect(next.bannerText).toBe("Maintenance tonight");
    expect(next.verifiedUser).toEqual({
      profileId: "f241b2c7-414e-4fc0-9623-dbea4a1cf449",
      username: "orionshock",
      displayName: undefined,
      firstName: "Apollo",
      lastName: "Shockman",
      email: "orionshock@gmail.com",
      role: "manager",
      isOwner: true,
      groups: [
        {
          id: "8ad00b1e-e108-4ad2-a0b4-1d5c465083c7",
          name: "Common Room",
          isPublicGroup: true,
          isCurator: false,
        },
        {
          id: "c7309a6d-3559-43eb-a5f0-0bf9eb83dcd0",
          name: "Fantasy Club",
          isPublicGroup: false,
          isCurator: true,
        },
      ],
    });
  });

  it("detects changes in account role and ownership during the background refresh", () => {
    const profile = applyCurrentAccountToProfile(baseProfile(), {
      username: "orionshock",
      role: "reader",
      must_change_password: false,
      is_owner: false,
      groups: [],
    }, "2026-06-25T12:00:00.000Z");

    const next = applyCurrentAccountToProfile(profile, {
      username: "orionshock",
      role: "manager",
      must_change_password: false,
      is_owner: true,
      groups: [],
    }, "2026-06-25T13:00:00.000Z", { markVerified: false });

    expect(hasCurrentAccountProfileChanged(profile, next)).toBe(true);
  });

  it("detects dynamic /me context changes during the background refresh", () => {
    const profile = applyCurrentAccountToProfile(baseProfile(), {
      username: "reader",
      advanced_library_groups_enabled: false,
      banner_text: null,
    }, "2026-06-25T12:00:00.000Z");

    const next = applyCurrentAccountToProfile(profile, {
      username: "reader",
      advanced_library_groups_enabled: true,
      banner_text: "Maintenance tonight",
    }, "2026-06-25T13:00:00.000Z", { markVerified: false });

    expect(hasCurrentAccountProfileChanged(profile, next)).toBe(true);
  });

  it("maps current account data without broad permission fields", () => {
    const next = applyCurrentAccountToProfile(baseProfile(), {
      username: "reader",
      email: "reader@example.com",
      first_name: "Read",
      last_name: "Er",
      profile_id: "profile-1",
      role: "reader",
      must_change_password: false,
      is_owner: false,
      groups: [],
    }, "2026-06-25T12:00:00.000Z");

    expect(next.verifiedUser).toMatchObject({
      profileId: "profile-1",
      username: "reader",
      role: "reader",
      isOwner: false,
      groups: [],
    });
  });
});
