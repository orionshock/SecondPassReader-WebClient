import { describe, expect, it } from "vitest";
import type { BrowserStorageEstimate } from "../../../app/offline/browser/BrowserStorageEstimate.Queries";
import { classifyOfflineStorageAdmission } from "../../../app/offline/publication/OfflineStorageAdmission.Policy";

const MEBIBYTE = 1024 * 1024;

describe("offline storage admission", () => {
  it("admits a large EPUB when estimated quota leaves the safety reserve intact", () => {
    const admission = classifyOfflineStorageAdmission({
      assetSizeBytes: 100 * MEBIBYTE,
      estimate: estimate(500 * MEBIBYTE, 2_048 * MEBIBYTE),
    });

    expect(admission.status).toBe("available");
  });

  it("rejects a small EPUB when the remaining usable budget is too small", () => {
    const admission = classifyOfflineStorageAdmission({
      assetSizeBytes: 2 * MEBIBYTE,
      estimate: estimate(399 * MEBIBYTE, 500 * MEBIBYTE),
    });

    expect(admission.status).toBe("insufficient");
  });

  it("reserves the greater of ten percent of quota and 100 MiB", () => {
    const absoluteReserve = classifyOfflineStorageAdmission({
      assetSizeBytes: 1,
      estimate: estimate(0, 500 * MEBIBYTE),
    });
    const percentageReserve = classifyOfflineStorageAdmission({
      assetSizeBytes: 1,
      estimate: estimate(0, 2_048 * MEBIBYTE),
    });

    expect(absoluteReserve).toMatchObject({ safetyReserveBytes: 100 * MEBIBYTE });
    expect(percentageReserve).toMatchObject({
      safetyReserveBytes: Math.ceil(2_048 * MEBIBYTE * 0.1),
    });
  });

  it("admits the exact usable-budget boundary and rejects one byte beyond it", () => {
    const estimateResult = estimate(300 * MEBIBYTE, 500 * MEBIBYTE);

    expect(classifyOfflineStorageAdmission({
      assetSizeBytes: 100 * MEBIBYTE,
      estimate: estimateResult,
    }).status).toBe("available");
    expect(classifyOfflineStorageAdmission({
      assetSizeBytes: 100 * MEBIBYTE + 1,
      estimate: estimateResult,
    }).status).toBe("insufficient");
  });

  it("supports an explicit reserve policy without imposing an EPUB size cap", () => {
    const admission = classifyOfflineStorageAdmission({
      assetSizeBytes: 450 * MEBIBYTE,
      estimate: estimate(50 * MEBIBYTE, 500 * MEBIBYTE),
      safetyReserve: { minimumBytes: 0, quotaFraction: 0 },
    });

    expect(admission).toEqual({
      status: "available",
      safetyReserveBytes: 0,
      usableBudgetBytes: 500 * MEBIBYTE,
    });
  });

  it.each([
    {
      estimate: { status: "unknown", usageBytes: null, quotaBytes: null, availableBytes: null } as const,
      expected: { status: "unknown", reason: "capacity" },
    },
    {
      estimate: { status: "unavailable", usageBytes: null, quotaBytes: null, availableBytes: null } as const,
      expected: { status: "unavailable" },
    },
  ])("preserves $estimate.status capacity without guessing", ({ estimate, expected }) => {
    expect(classifyOfflineStorageAdmission({ assetSizeBytes: MEBIBYTE, estimate })).toEqual(expected);
  });
});

function estimate(usageBytes: number, quotaBytes: number): BrowserStorageEstimate {
  return {
    status: "available",
    usageBytes,
    quotaBytes,
    availableBytes: Math.max(0, quotaBytes - usageBytes),
  };
}
