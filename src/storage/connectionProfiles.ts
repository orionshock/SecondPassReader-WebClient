export type ConnectionProfile = {
  id: string;
  label: string;
  serverBaseUrl: string;
  createdAt: string;
  lastUsedAt?: string | null;
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
  return readAll();
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

