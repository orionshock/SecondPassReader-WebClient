import type { MePayload } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/connectionProfiles";

type VerifiedUser = NonNullable<ConnectionProfile["verifiedUser"]>;

export function applyCurrentAccountToProfile(
  profile: ConnectionProfile,
  me: MePayload,
  isoNow: string,
  options: { markVerified?: boolean } = {},
): ConnectionProfile {
  return {
    ...profile,
    verifiedAt: options.markVerified === false ? profile.verifiedAt : isoNow,
    verifiedUser: pickVerifiedUser(me),
    mustChangePassword: me.must_change_password ?? false,
    lastUsedAt: isoNow,
  };
}

export function hasCurrentAccountProfileChanged(profile: ConnectionProfile, next: ConnectionProfile): boolean {
  return (
    profile.verifiedAt !== next.verifiedAt ||
    profile.mustChangePassword !== next.mustChangePassword ||
    !verifiedUsersEqual(profile.verifiedUser, next.verifiedUser)
  );
}

function pickVerifiedUser(me: MePayload): VerifiedUser {
  return {
    profileId: me.profile_id,
    username: me.username,
    displayName: me.display_name,
    firstName: me.first_name,
    lastName: me.last_name,
    email: me.email,
    role: me.role,
    isOwner: me.is_owner,
    groups: Array.isArray(me.groups)
      ? me.groups.map((group) => ({
          id: group.id,
          name: group.name,
          isPublicGroup: group.is_public_group,
          isCurator: group.is_curator,
        }))
      : undefined,
  };
}

function verifiedUsersEqual(a: ConnectionProfile["verifiedUser"], b: ConnectionProfile["verifiedUser"]): boolean {
  if (!a || !b) return a === b;
  return (
    a.profileId === b.profileId &&
    a.username === b.username &&
    a.displayName === b.displayName &&
    a.firstName === b.firstName &&
    a.lastName === b.lastName &&
    a.email === b.email &&
    a.role === b.role &&
    a.isOwner === b.isOwner &&
    JSON.stringify(a.groups ?? null) === JSON.stringify(b.groups ?? null)
  );
}
