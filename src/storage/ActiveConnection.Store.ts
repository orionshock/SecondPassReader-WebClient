export type ActiveConnection = {
  id: string;
  label: string;
  serverBaseUrl: string;
  apiBaseUrl?: string;
  serverName?: string;
  serverDescription?: string;
  serverVersion?: string;
  serverRelease?: string;
  serverReleaseDate?: string;
  advancedLibraryGroupsEnabled?: boolean;
  bannerText?: string | null;
  readingClientBaseUrl?: string;
  marginaliaProfileUri?: string;
  publicGroup?: {
    id: string;
    name: string;
    description: string;
  };
  accessToken?: string;
  authenticationState?: "repair-required" | "verifying-repair";
  tokenType?: string;
  clientSessionId?: string;
  clientSessionName?: string;
  linkedAt?: string;
  verifiedAt?: string;
  verifiedUser?: {
    profileId?: string;
    username: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    role?: string;
    isOwner?: boolean;
    isManager?: boolean;
    isLibrarian?: boolean;
    isReader?: boolean;
    canAccessDjangoAdmin?: boolean;
    groups?: Array<{
      id: string;
      name: string;
      isPublicGroup: boolean;
      isCurator: boolean;
    }>;
  };
  mustChangePassword?: boolean;
  clientApi?: {
    discoveryVersion: string;
    loginRequestEndpoint: string;
    pollEndpointTemplate: string;
    consumeEndpointTemplate: string;
    tokenType: string;
  };
  createdAt: string;
  lastUsedAt?: string;
  lastCheckedAt?: string;
};

const ACTIVE_CONNECTION_KEY = "secondpass.activeConnection.v1";
const LEGACY_CONNECTIONS_KEY = "secondpass.connectionProfiles.v1";
const LEGACY_SELECTED_CONNECTION_KEY = "secondpass.selectedConnectionProfileId.v1";

export type ActiveConnectionPublication = Readonly<{ token: symbol }>;

let publicationGeneration = 0;
const publicationOwnership = new WeakMap<ActiveConnectionPublication, {
  generation: number;
  expectedRecord: string | null;
}>();

function readActive(): ActiveConnection | null {
  const raw = localStorage.getItem(ACTIVE_CONNECTION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const connection = parsed as Partial<ActiveConnection>;
    if (!connection.id || !connection.serverBaseUrl || !connection.createdAt) return null;
    return connection as ActiveConnection;
  } catch {
    return null;
  }
}

function writeActive(connection: ActiveConnection) {
  invalidateActiveConnectionPublications();
  localStorage.setItem(ACTIVE_CONNECTION_KEY, JSON.stringify(connection));
}

function serializedConnection(connection: ActiveConnection | null): string | null {
  return connection ? JSON.stringify(connection) : null;
}

export function getActiveConnection(): ActiveConnection | null {
  return readActive();
}

export function beginActiveConnectionPublication(
  expected: ActiveConnection | null,
): ActiveConnectionPublication | null {
  const expectedRecord = serializedConnection(expected);
  if (serializedConnection(readActive()) !== expectedRecord) return null;
  publicationGeneration += 1;
  const publication = Object.freeze({ token: Symbol("active-connection-publication") });
  publicationOwnership.set(publication, { generation: publicationGeneration, expectedRecord });
  return publication;
}

export function isActiveConnectionPublicationCurrent(
  publication: ActiveConnectionPublication,
): boolean {
  const ownership = publicationOwnership.get(publication);
  return ownership?.generation === publicationGeneration
    && serializedConnection(readActive()) === ownership.expectedRecord;
}

export function publishActiveConnectionResult(
  publication: ActiveConnectionPublication,
  publish: () => void,
): boolean {
  // Async verification/refresh may outlive its connection. Results publish only while both the
  // operation generation and the exact active connection record that started it remain current.
  if (!isActiveConnectionPublicationCurrent(publication)) return false;
  publish();
  return true;
}

function invalidateActiveConnectionPublications(): void {
  publicationGeneration += 1;
}

export function saveActiveConnection(connection: ActiveConnection): void {
  writeActive(connection);
  try {
    localStorage.removeItem(LEGACY_CONNECTIONS_KEY);
    localStorage.removeItem(LEGACY_SELECTED_CONNECTION_KEY);
  } catch {
    // Legacy-key cleanup must not block the active single-connection record.
  }
}

export function clearActiveConnection(): void {
  invalidateActiveConnectionPublications();
  localStorage.removeItem(ACTIVE_CONNECTION_KEY);
  try {
    localStorage.removeItem(LEGACY_CONNECTIONS_KEY);
    localStorage.removeItem(LEGACY_SELECTED_CONNECTION_KEY);
  } catch {
    // The active connection is already gone; legacy residue is inert.
  }
}
