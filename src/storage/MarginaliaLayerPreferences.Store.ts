const STORAGE_KEY = "secondpass:marginaliaLayers:v1";
const TTL_MS = 90 * 24 * 60 * 60 * 1000;

type MarginaliaLayerPreferenceEntry = {
  updatedAt: number;
  selectedPreviousSessionIds: string[];
};

type MarginaliaLayerPreferenceStore = Record<string, MarginaliaLayerPreferenceEntry>;

function getStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function normalizeSelectedIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of input) {
    if (typeof value !== "string") continue;
    const id = value.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function isExpired(updatedAt: unknown, nowMs: number): boolean {
  return typeof updatedAt !== "number" || !Number.isFinite(updatedAt) || nowMs - updatedAt > TTL_MS;
}

function parseAndPruneStore(raw: string | null, nowMs: number): { store: MarginaliaLayerPreferenceStore; changed: boolean } {
  if (!raw) return { store: {}, changed: false };

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { store: {}, changed: true };

    const nextStore: MarginaliaLayerPreferenceStore = {};
    let changed = false;

    for (const [bookId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        changed = true;
        continue;
      }

      const entry = value as { updatedAt?: unknown; selectedPreviousSessionIds?: unknown };
      if (isExpired(entry.updatedAt, nowMs)) {
        changed = true;
        continue;
      }

      const selectedPreviousSessionIds = normalizeSelectedIds(entry.selectedPreviousSessionIds);
      if (selectedPreviousSessionIds.length === 0) {
        changed = true;
        continue;
      }

      nextStore[bookId] = {
        updatedAt: entry.updatedAt as number,
        selectedPreviousSessionIds,
      };

      if (selectedPreviousSessionIds.length !== (Array.isArray(entry.selectedPreviousSessionIds) ? entry.selectedPreviousSessionIds.length : 0)) {
        changed = true;
      }
    }

    return { store: nextStore, changed };
  } catch {
    return { store: {}, changed: true };
  }
}

function writeStore(storage: Storage, store: MarginaliaLayerPreferenceStore): void {
  try {
    const bookIds = Object.keys(store);
    if (bookIds.length === 0) {
      storage.removeItem(STORAGE_KEY);
      return;
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore localStorage write failures.
  }
}

export function loadMarginaliaLayerPreferences(bookId: string | number): string[] {
  const storage = getStorage();
  if (!storage) return [];

  const nowMs = Date.now();
  const { store, changed } = parseAndPruneStore(storage.getItem(STORAGE_KEY), nowMs);
  if (changed) writeStore(storage, store);

  const entry = store[String(bookId)];
  return entry ? [...entry.selectedPreviousSessionIds] : [];
}

export function saveMarginaliaLayerPreferences(bookId: string | number, selectedPreviousSessionIds: string[]): void {
  const storage = getStorage();
  if (!storage) return;

  const nowMs = Date.now();
  const { store } = parseAndPruneStore(storage.getItem(STORAGE_KEY), nowMs);
  const nextSelectedIds = normalizeSelectedIds(selectedPreviousSessionIds);
  const key = String(bookId);

  if (nextSelectedIds.length === 0) {
    delete store[key];
    writeStore(storage, store);
    return;
  }

  store[key] = {
    updatedAt: nowMs,
    selectedPreviousSessionIds: nextSelectedIds,
  };
  writeStore(storage, store);
}

export const marginaliaLayerPreferencesStorageKey = STORAGE_KEY;
