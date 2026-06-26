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
      capabilities: {
        can_manage_users: true,
        can_manage_library: true,
        can_import_books: true,
        can_create_library_groups: true,
        can_manage_group_memberships: true,
        can_manage_group_identity: true,
        can_edit_group_presentation: true,
        can_access_imports: true,
      },
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
    expect(next.verifiedUser).toEqual({
      profileId: "f241b2c7-414e-4fc0-9623-dbea4a1cf449",
      username: "orionshock",
      displayName: undefined,
      firstName: "Apollo",
      lastName: "Shockman",
      email: "orionshock@gmail.com",
      role: "manager",
      isOwner: true,
      capabilities: {
        can_manage_users: true,
        can_manage_library: true,
        can_import_books: true,
        can_create_library_groups: true,
        can_manage_group_memberships: true,
        can_manage_group_identity: true,
        can_edit_group_presentation: true,
        can_access_imports: true,
      },
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

  it("detects changes in account permissions during the background refresh", () => {
    const profile = applyCurrentAccountToProfile(baseProfile(), {
      username: "orionshock",
      role: "reader",
      must_change_password: false,
      is_owner: false,
      capabilities: { can_manage_library: false },
      groups: [],
    }, "2026-06-25T12:00:00.000Z");

    const next = applyCurrentAccountToProfile(profile, {
      username: "orionshock",
      role: "manager",
      must_change_password: false,
      is_owner: true,
      capabilities: { can_manage_library: true },
      groups: [],
    }, "2026-06-25T13:00:00.000Z", { markVerified: false });

    expect(hasCurrentAccountProfileChanged(profile, next)).toBe(true);
  });
});
