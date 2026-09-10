import { afterEach, describe, expect, it, vi } from "vitest";
import { requestBrowserPersistentStorage } from "../../../app/offline/browser/BrowserPersistentStorage.Actions";

describe("browser persistent storage request", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns already granted without requesting persistence", async () => {
    const persist = vi.fn(async () => true);
    installStorage({ persisted: async () => true, persist });

    await expect(requestBrowserPersistentStorage()).resolves.toEqual({ status: "already-granted" });
    expect(persist).not.toHaveBeenCalled();
  });

  it("returns granted after one explicit persistence request", async () => {
    const persist = vi.fn(async () => true);
    installStorage({ persisted: async () => false, persist });

    await expect(requestBrowserPersistentStorage()).resolves.toEqual({ status: "granted" });
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("returns denied after one declined persistence request", async () => {
    const persist = vi.fn(async () => false);
    installStorage({ persisted: async () => false, persist });

    await expect(requestBrowserPersistentStorage()).resolves.toEqual({ status: "denied" });
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it.each([
    { granted: true, expectedStatus: "granted" },
    { granted: false, expectedStatus: "denied" },
  ] as const)(
    "returns $expectedStatus when persisted() is absent and persist() returns $granted",
    async ({ granted, expectedStatus }) => {
      const persist = vi.fn(async () => granted);
      installStorage({ persist });

      await expect(requestBrowserPersistentStorage()).resolves.toEqual({ status: expectedStatus });
      expect(persist).toHaveBeenCalledTimes(1);
    },
  );

  it("returns unsupported when persist() is absent", async () => {
    installStorage({ persisted: async () => false });

    await expect(requestBrowserPersistentStorage()).resolves.toEqual({ status: "unsupported" });
  });

  it("returns unsupported when StorageManager is absent", async () => {
    vi.stubGlobal("navigator", {});

    await expect(requestBrowserPersistentStorage()).resolves.toEqual({ status: "unsupported" });
  });

  it("returns unsupported outside a browser environment", async () => {
    vi.stubGlobal("navigator", undefined);

    await expect(requestBrowserPersistentStorage()).resolves.toEqual({ status: "unsupported" });
  });

  it("contains persisted() failures without making a persistence request", async () => {
    const persist = vi.fn(async () => true);
    installStorage({
      persisted: async () => {
        throw new Error("sensitive persisted failure");
      },
      persist,
    });

    const result = await requestBrowserPersistentStorage();

    expect(result).toEqual({ status: "failed" });
    expect(persist).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("sensitive persisted failure");
  });

  it("contains persist() failures after one request", async () => {
    const persist = vi.fn(async () => {
      throw new Error("sensitive persist failure");
    });
    installStorage({ persisted: async () => false, persist });

    const result = await requestBrowserPersistentStorage();

    expect(result).toEqual({ status: "failed" });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("sensitive persist failure");
  });
});

type StorageOverrides = {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
};

function installStorage(overrides: StorageOverrides): void {
  vi.stubGlobal("navigator", {
    storage: {
      persisted: overrides.persisted,
      persist: overrides.persist,
    } as StorageManager,
  });
}
