import { afterEach, describe, expect, it, vi } from "vitest";
import { getBrowserStorageEstimate } from "../app/offline/BrowserStorageEstimate.Queries";

describe("browser storage estimate", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps a useful browser estimate to normalized byte capacity", async () => {
    vi.stubGlobal("navigator", storageNavigator(async () => ({ usage: 250, quota: 1_000 })));

    await expect(getBrowserStorageEstimate()).resolves.toEqual({
      status: "available",
      usageBytes: 250,
      quotaBytes: 1_000,
      availableBytes: 750,
    });
  });

  it("reports unknown when the browser omits useful estimate values", async () => {
    vi.stubGlobal("navigator", storageNavigator(async () => ({ quota: 1_000 })));

    await expect(getBrowserStorageEstimate()).resolves.toEqual({
      status: "unknown",
      usageBytes: null,
      quotaBytes: null,
      availableBytes: null,
    });
  });

  it("reports unavailable when the StorageManager estimate API is absent", async () => {
    vi.stubGlobal("navigator", {});

    await expect(getBrowserStorageEstimate()).resolves.toEqual({
      status: "unavailable",
      usageBytes: null,
      quotaBytes: null,
      availableBytes: null,
    });
  });

  it("contains estimate failures as unavailable capacity", async () => {
    vi.stubGlobal("navigator", storageNavigator(async () => {
      throw new Error("browser estimate failed");
    }));

    await expect(getBrowserStorageEstimate()).resolves.toEqual({
      status: "unavailable",
      usageBytes: null,
      quotaBytes: null,
      availableBytes: null,
    });
  });
});

function storageNavigator(estimate: () => Promise<StorageEstimate>): Partial<Navigator> {
  return { storage: { estimate } as StorageManager };
}
