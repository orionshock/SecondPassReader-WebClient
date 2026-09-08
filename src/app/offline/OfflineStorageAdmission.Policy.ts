import type { BrowserStorageEstimate } from "./BrowserStorageEstimate.State";

const MEBIBYTE = 1024 * 1024;

export type OfflineStorageSafetyReserve = {
  minimumBytes: number;
  quotaFraction: number;
};

export const DEFAULT_OFFLINE_STORAGE_SAFETY_RESERVE: OfflineStorageSafetyReserve = {
  minimumBytes: 100 * MEBIBYTE,
  quotaFraction: 0.1,
};

export type OfflineStorageAdmission =
  | {
      status: "available" | "insufficient";
      safetyReserveBytes: number;
      usableBudgetBytes: number;
    }
  | { status: "unknown"; reason: "capacity" | "asset-size" }
  | { status: "unavailable" };

export function classifyOfflineStorageAdmission(input: {
  assetSizeBytes: number;
  estimate: BrowserStorageEstimate;
  safetyReserve?: OfflineStorageSafetyReserve;
}): OfflineStorageAdmission {
  if (!isByteCount(input.assetSizeBytes)) {
    return { status: "unknown", reason: "asset-size" };
  }
  const estimate = input.estimate;
  if (estimate.status === "unavailable") return { status: "unavailable" };
  if (estimate.status === "unknown") return { status: "unknown", reason: "capacity" };

  const reserve = normalizeSafetyReserve(
    input.safetyReserve ?? DEFAULT_OFFLINE_STORAGE_SAFETY_RESERVE,
  );
  const safetyReserveBytes = Math.max(
    Math.ceil(estimate.quotaBytes * reserve.quotaFraction),
    reserve.minimumBytes,
  );
  const usableBudgetBytes = Math.max(0, estimate.quotaBytes - safetyReserveBytes);
  const status = estimate.usageBytes + input.assetSizeBytes <= usableBudgetBytes
    ? "available"
    : "insufficient";

  return { status, safetyReserveBytes, usableBudgetBytes };
}

function isByteCount(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function normalizeSafetyReserve(
  reserve: OfflineStorageSafetyReserve,
): OfflineStorageSafetyReserve {
  return {
    minimumBytes: isByteCount(reserve.minimumBytes)
      ? reserve.minimumBytes
      : DEFAULT_OFFLINE_STORAGE_SAFETY_RESERVE.minimumBytes,
    quotaFraction: Number.isFinite(reserve.quotaFraction)
      && reserve.quotaFraction >= 0
      && reserve.quotaFraction <= 1
      ? reserve.quotaFraction
      : DEFAULT_OFFLINE_STORAGE_SAFETY_RESERVE.quotaFraction,
  };
}
