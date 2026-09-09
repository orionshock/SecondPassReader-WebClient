import type { CurrentUser, ServerInfo } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";

type VerifiedUser = NonNullable<ConnectionProfile["verifiedUser"]>;

export function applyCurrentAccountToProfile(
  profile: ConnectionProfile,
  me: CurrentUser,
  isoNow: string,
  options: { markVerified?: boolean } = {},
): ConnectionProfile {
  return {
    ...profile,
    verifiedAt: options.markVerified === false ? profile.verifiedAt : isoNow,
    verifiedUser: pickVerifiedUser(me),
    mustChangePassword: me.mustChangePassword,
    lastUsedAt: isoNow,
  };
}

export function applyServerInfoToProfile(
  profile: ConnectionProfile,
  serverInfo: ServerInfo,
  isoNow: string,
): ConnectionProfile {
  return {
    ...profile,
    serverName: serverInfo.name,
    serverDescription: serverInfo.description,
    serverVersion: serverInfo.version,
    serverReleaseDate: serverInfo.releaseDate,
    advancedLibraryGroupsEnabled: serverInfo.advancedLibraryGroupsEnabled,
    bannerText: serverInfo.bannerText || null,
    readingClientBaseUrl: serverInfo.readingClientBaseUrl,
    marginaliaProfileUri: serverInfo.marginaliaProfileUri,
    publicGroup: serverInfo.publicGroup,
    lastCheckedAt: isoNow,
    lastUsedAt: isoNow,
  };
}

export function applyAuthenticatedContextToProfile(
  profile: ConnectionProfile,
  currentUser: CurrentUser,
  serverInfo: ServerInfo,
  isoNow: string,
  options: { markVerified?: boolean } = {},
): ConnectionProfile {
  const authenticated = applyServerInfoToProfile(
    applyCurrentAccountToProfile(profile, currentUser, isoNow, options),
    serverInfo,
    isoNow,
  );
  const { authenticationState: _authenticationState, ...readyProfile } = authenticated;
  return readyProfile;
}

export function hasCurrentAccountProfileChanged(profile: ConnectionProfile, next: ConnectionProfile): boolean {
  return (
    profile.verifiedAt !== next.verifiedAt ||
    profile.mustChangePassword !== next.mustChangePassword ||
    profile.advancedLibraryGroupsEnabled !== next.advancedLibraryGroupsEnabled ||
    profile.bannerText !== next.bannerText ||
    profile.serverName !== next.serverName ||
    profile.serverDescription !== next.serverDescription ||
    profile.serverVersion !== next.serverVersion ||
    profile.serverReleaseDate !== next.serverReleaseDate ||
    profile.readingClientBaseUrl !== next.readingClientBaseUrl ||
    profile.marginaliaProfileUri !== next.marginaliaProfileUri ||
    JSON.stringify(profile.publicGroup ?? null) !== JSON.stringify(next.publicGroup ?? null) ||
    !verifiedUsersEqual(profile.verifiedUser, next.verifiedUser)
  );
}

function pickVerifiedUser(me: CurrentUser): VerifiedUser {
  return {
    profileId: me.profileId,
    username: me.username,
    firstName: me.firstName,
    lastName: me.lastName,
    email: me.email,
    role: me.role,
    isOwner: me.isOwner,
    isManager: me.isManager,
    isLibrarian: me.isLibrarian,
    isReader: me.isReader,
    canAccessDjangoAdmin: me.canAccessDjangoAdmin,
    groups: me.groups,
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
    a.isManager === b.isManager &&
    a.isLibrarian === b.isLibrarian &&
    a.isReader === b.isReader &&
    a.canAccessDjangoAdmin === b.canAccessDjangoAdmin &&
    JSON.stringify(a.groups ?? null) === JSON.stringify(b.groups ?? null)
  );
}
