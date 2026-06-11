export type ConnectionProfile = {
  id: string;
  label: string;
  serverBaseUrl: string;
  apiBaseUrl?: string;
  serverName?: string;
  serverDescription?: string;
  accessToken?: string;
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
  };
  mustChangePassword?: boolean;
  clientApi?: {
    discoveryVersion: string;
    discoveryEndpoint: string;
    loginRequestEndpoint: string;
    authorizeUrl: string;
    pollEndpointTemplate: string;
  };
  createdAt: string;
  lastUsedAt?: string;
  lastCheckedAt?: string;
};

const ACTIVE_CONNECTION_KEY = "secondpass.activeConnection.v1";
const OLD_PROFILES_KEY = "secondpass.connectionProfiles.v1";
const OLD_SELECTED_PROFILE_KEY = "secondpass.selectedConnectionProfileId.v1";

export type ActiveConnection = ConnectionProfile;

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
  localStorage.setItem(ACTIVE_CONNECTION_KEY, JSON.stringify(connection));
}

export function getActiveConnection(): ActiveConnection | null {
  return readActive();
}

export function saveActiveConnection(connection: ActiveConnection): void {
  writeActive(connection);
  try {
    localStorage.removeItem(OLD_PROFILES_KEY);
    localStorage.removeItem(OLD_SELECTED_PROFILE_KEY);
  } catch {
    // ignore cleanup errors
  }
}

export function clearActiveConnection(): void {
  localStorage.removeItem(ACTIVE_CONNECTION_KEY);
  try {
    localStorage.removeItem(OLD_PROFILES_KEY);
    localStorage.removeItem(OLD_SELECTED_PROFILE_KEY);
  } catch {
    // ignore cleanup errors
  }
}

export function touchActiveConnectionLastUsed(isoNow = new Date().toISOString()): void {
  const connection = readActive();
  if (!connection) return;
  writeActive({ ...connection, lastUsedAt: isoNow });
}

export function listConnectionProfiles(): ConnectionProfile[] {
  const active = readActive();
  return active ? [active] : [];
}

export function getConnectionProfile(profileId: string): ConnectionProfile | undefined {
  const active = readActive();
  if (!active) return undefined;
  return active.id === profileId ? active : undefined;
}

export function saveConnectionProfile(profile: ConnectionProfile): void {
  saveActiveConnection(profile);
}

export function deleteConnectionProfile(profileId: string): void {
  const active = readActive();
  if (active?.id === profileId) clearActiveConnection();
}

export function touchConnectionProfileLastUsed(profileId: string, isoNow = new Date().toISOString()): void {
  const active = readActive();
  if (active?.id !== profileId) return;
  writeActive({ ...active, lastUsedAt: isoNow });
}
