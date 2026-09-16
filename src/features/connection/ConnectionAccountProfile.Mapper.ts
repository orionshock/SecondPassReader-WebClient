import type { CurrentUser, ServerInfo } from "@secondpass/client";
import type { ActiveConnection } from "../../storage/ActiveConnection.Store";

type VerifiedUser = NonNullable<ActiveConnection["verifiedUser"]>;

export function applyCurrentAccountToConnection(
  connection: ActiveConnection,
  me: CurrentUser,
  isoNow: string,
  options: { markVerified?: boolean } = {},
): ActiveConnection {
  return {
    ...connection,
    verifiedAt: options.markVerified === false ? connection.verifiedAt : isoNow,
    verifiedUser: pickVerifiedUser(me),
    mustChangePassword: me.mustChangePassword,
    lastUsedAt: isoNow,
  };
}

export function applyServerInfoToConnection(
  connection: ActiveConnection,
  serverInfo: ServerInfo,
  isoNow: string,
): ActiveConnection {
  return {
    ...connection,
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

export function applyAuthenticatedContextToConnection(
  connection: ActiveConnection,
  currentUser: CurrentUser,
  serverInfo: ServerInfo,
  isoNow: string,
  options: { markVerified?: boolean } = {},
): ActiveConnection {
  const authenticated = applyServerInfoToConnection(
    applyCurrentAccountToConnection(connection, currentUser, isoNow, options),
    serverInfo,
    isoNow,
  );
  const { authenticationState: _authenticationState, ...readyConnection } = authenticated;
  return readyConnection;
}

export function hasCurrentAccountChanged(connection: ActiveConnection, next: ActiveConnection): boolean {
  return (
    connection.verifiedAt !== next.verifiedAt ||
    connection.mustChangePassword !== next.mustChangePassword ||
    connection.advancedLibraryGroupsEnabled !== next.advancedLibraryGroupsEnabled ||
    connection.bannerText !== next.bannerText ||
    connection.serverName !== next.serverName ||
    connection.serverDescription !== next.serverDescription ||
    connection.serverVersion !== next.serverVersion ||
    connection.serverReleaseDate !== next.serverReleaseDate ||
    connection.readingClientBaseUrl !== next.readingClientBaseUrl ||
    connection.marginaliaProfileUri !== next.marginaliaProfileUri ||
    JSON.stringify(connection.publicGroup ?? null) !== JSON.stringify(next.publicGroup ?? null) ||
    !verifiedUsersEqual(connection.verifiedUser, next.verifiedUser)
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

function verifiedUsersEqual(a: ActiveConnection["verifiedUser"], b: ActiveConnection["verifiedUser"]): boolean {
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
