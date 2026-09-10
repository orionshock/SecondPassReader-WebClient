import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getBrowserOfflinePersistenceCapability } from "../app/offline/BrowserOfflineCapability.Queries";

describe("browser offline persistence capability", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports full support when persistent storage is already granted", async () => {
    const persist = vi.fn(async () => true);
    installBrowser({ persisted: async () => true, persist });

    await expect(getBrowserOfflinePersistenceCapability()).resolves.toEqual({
      status: "supported",
      indexedDbAvailable: true,
      storageEstimateAvailable: true,
      persistentStorageSupported: true,
      persistentStorageGranted: true,
      reason: null,
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it("reports full support without requesting persistence when it is not granted", async () => {
    const persist = vi.fn(async () => true);
    installBrowser({ persisted: async () => false, persist });

    const capability = await getBrowserOfflinePersistenceCapability();

    expect(capability).toMatchObject({
      status: "supported",
      persistentStorageSupported: true,
      persistentStorageGranted: false,
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it("reports limited capability when StorageManager is absent", async () => {
    installIndexedDb();
    vi.stubGlobal("navigator", {});

    await expect(getBrowserOfflinePersistenceCapability()).resolves.toMatchObject({
      status: "limited",
      indexedDbAvailable: true,
      storageEstimateAvailable: false,
      persistentStorageSupported: false,
      reason: "storage-api-unavailable",
    });
  });

  it("reports limited capability when persisted state cannot be queried", async () => {
    installBrowser({ persist: vi.fn(async () => true) });

    await expect(getBrowserOfflinePersistenceCapability()).resolves.toMatchObject({
      status: "limited",
      storageEstimateAvailable: true,
      persistentStorageSupported: false,
      persistentStorageGranted: null,
      reason: "persistent-storage-unavailable",
    });
  });

  it("contains persistence-query errors as limited capability", async () => {
    installBrowser({
      persisted: async () => {
        throw new Error("sensitive persistence failure");
      },
      persist: vi.fn(async () => true),
    });

    const capability = await getBrowserOfflinePersistenceCapability();

    expect(capability).toMatchObject({
      status: "limited",
      persistentStorageSupported: true,
      persistentStorageGranted: null,
      reason: "persistence-query-failed",
    });
    expect(JSON.stringify(capability)).not.toContain("sensitive persistence failure");
  });

  it("reports limited capability when the storage estimate fails", async () => {
    installBrowser({
      estimate: async () => {
        throw new Error("estimate failed");
      },
      persisted: async () => true,
      persist: vi.fn(async () => true),
    });

    await expect(getBrowserOfflinePersistenceCapability()).resolves.toMatchObject({
      status: "limited",
      storageEstimateAvailable: false,
      persistentStorageSupported: true,
      persistentStorageGranted: true,
      reason: "storage-estimate-unavailable",
    });
  });

  it("reports unavailable when IndexedDB is absent", async () => {
    vi.stubGlobal("indexedDB", undefined);
    vi.stubGlobal("navigator", storageNavigator({
      persisted: async () => true,
      persist: vi.fn(async () => true),
    }));

    await expect(getBrowserOfflinePersistenceCapability()).resolves.toEqual({
      status: "unavailable",
      indexedDbAvailable: false,
      storageEstimateAvailable: false,
      persistentStorageSupported: false,
      persistentStorageGranted: null,
      reason: "indexeddb-unavailable",
    });
  });

  it("reports unavailable when the IndexedDB probe fails", async () => {
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new Error("database access denied");
      },
    });
    vi.stubGlobal("navigator", storageNavigator({}));

    const capability = await getBrowserOfflinePersistenceCapability();

    expect(capability).toMatchObject({
      status: "unavailable",
      reason: "indexeddb-unavailable",
    });
    expect(JSON.stringify(capability)).not.toContain("database access denied");
  });

  it("reports unavailable outside a browser environment", async () => {
    vi.stubGlobal("indexedDB", undefined);
    vi.stubGlobal("navigator", undefined);

    await expect(getBrowserOfflinePersistenceCapability()).resolves.toMatchObject({
      status: "unavailable",
      indexedDbAvailable: false,
    });
  });
});

type StorageOverrides = {
  estimate?: () => Promise<StorageEstimate>;
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
};

function installBrowser(overrides: StorageOverrides): void {
  installIndexedDb();
  vi.stubGlobal("navigator", storageNavigator(overrides));
}

function installIndexedDb(): void {
  vi.stubGlobal("indexedDB", new IDBFactory());
}

function storageNavigator(overrides: StorageOverrides): Partial<Navigator> {
  return {
    storage: {
      estimate: overrides.estimate ?? (async () => ({ usage: 100, quota: 1_000 })),
      persisted: overrides.persisted,
      persist: overrides.persist,
    } as StorageManager,
  };
}
