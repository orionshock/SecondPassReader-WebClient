import { openOfflineDatabase } from "../storage/IndexedDbOfflineDatabase.Adapter";
import { getBrowserStorageEstimate } from "./BrowserStorageEstimate.Queries";

export type BrowserOfflineCapabilityReason =
  | "indexeddb-unavailable"
  | "storage-api-unavailable"
  | "storage-estimate-unavailable"
  | "persistent-storage-unavailable"
  | "persistence-query-failed";

export type BrowserOfflineCapability = {
  status: "supported" | "limited" | "unavailable";
  indexedDbAvailable: boolean;
  storageEstimateAvailable: boolean;
  persistentStorageSupported: boolean;
  persistentStorageGranted: boolean | null;
  reason: BrowserOfflineCapabilityReason | null;
};

export async function getBrowserOfflinePersistenceCapability(): Promise<BrowserOfflineCapability> {
  if (!await probeIndexedDb()) {
    return {
      status: "unavailable",
      indexedDbAvailable: false,
      storageEstimateAvailable: false,
      persistentStorageSupported: false,
      persistentStorageGranted: null,
      reason: "indexeddb-unavailable",
    };
  }

  const storage = getStorageManager();
  if (!storage) {
    return limitedCapability({ reason: "storage-api-unavailable" });
  }

  const estimate = await getBrowserStorageEstimate();
  const storageEstimateAvailable = estimate.status === "available";
  const persistenceQueryAvailable = typeof storage.persisted === "function";
  const persistenceRequestAvailable = typeof storage.persist === "function";
  const persistentStorageSupported = persistenceQueryAvailable && persistenceRequestAvailable;
  let persistentStorageGranted: boolean | null = null;
  let persistenceQueryFailed = false;

  if (persistenceQueryAvailable) {
    try {
      const granted = await storage.persisted();
      if (typeof granted === "boolean") persistentStorageGranted = granted;
      else persistenceQueryFailed = true;
    } catch {
      persistenceQueryFailed = true;
    }
  }

  if (storageEstimateAvailable && persistentStorageSupported && !persistenceQueryFailed) {
    return {
      status: "supported",
      indexedDbAvailable: true,
      storageEstimateAvailable: true,
      persistentStorageSupported: true,
      persistentStorageGranted,
      reason: null,
    };
  }

  return limitedCapability({
    storageEstimateAvailable,
    persistentStorageSupported,
    persistentStorageGranted,
    reason: !storageEstimateAvailable
      ? "storage-estimate-unavailable"
      : persistenceQueryFailed
        ? "persistence-query-failed"
        : "persistent-storage-unavailable",
  });
}

async function probeIndexedDb(): Promise<boolean> {
  try {
    const database = await openOfflineDatabase();
    database.close();
    return true;
  } catch {
    return false;
  }
}

function getStorageManager(): StorageManager | null {
  try {
    return typeof navigator === "undefined" ? null : navigator.storage ?? null;
  } catch {
    return null;
  }
}

function limitedCapability(input: {
  reason: BrowserOfflineCapabilityReason;
  storageEstimateAvailable?: boolean;
  persistentStorageSupported?: boolean;
  persistentStorageGranted?: boolean | null;
}): BrowserOfflineCapability {
  return {
    status: "limited",
    indexedDbAvailable: true,
    storageEstimateAvailable: input.storageEstimateAvailable ?? false,
    persistentStorageSupported: input.persistentStorageSupported ?? false,
    persistentStorageGranted: input.persistentStorageGranted ?? null,
    reason: input.reason,
  };
}
