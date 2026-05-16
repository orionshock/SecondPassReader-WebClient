export type ConnectionProfile = {
  id: string;
  label: string;
  serverBaseUrl: string;
  apiBaseUrl?: string;
  serverName?: string;
  accessToken?: string;
  clientSessionId?: string;
  createdAt: string;
  lastUsedAt?: string;
};

const STORAGE_KEY = "secondpass.connectionProfiles.v1";

function readAll(): ConnectionProfile[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as ConnectionProfile[];
  } catch {
    return [];
  }
}

function writeAll(profiles: ConnectionProfile[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

export function listConnectionProfiles(): ConnectionProfile[] {
  return readAll().sort((a, b) => (b.lastUsedAt ?? b.createdAt).localeCompare(a.lastUsedAt ?? a.createdAt));
}

export function getConnectionProfile(profileId: string): ConnectionProfile | undefined {
  return readAll().find((p) => p.id === profileId);
}

export function saveConnectionProfile(profile: ConnectionProfile): void {
  const profiles = readAll();
  const index = profiles.findIndex((p) => p.id === profile.id);
  if (index >= 0) profiles[index] = profile;
  else profiles.push(profile);
  writeAll(profiles);
}

export function deleteConnectionProfile(profileId: string): void {
  const profiles = readAll().filter((p) => p.id !== profileId);
  writeAll(profiles);
}

export function touchConnectionProfileLastUsed(profileId: string, isoNow = new Date().toISOString()): void {
  const profiles = readAll();
  const index = profiles.findIndex((p) => p.id === profileId);
  if (index < 0) return;
  profiles[index] = { ...profiles[index], lastUsedAt: isoNow };
  writeAll(profiles);
}
