export type BrowserStorageEstimate =
  | {
      status: "available";
      usageBytes: number;
      quotaBytes: number;
      availableBytes: number;
    }
  | {
      status: "unknown";
      usageBytes: null;
      quotaBytes: null;
      availableBytes: null;
    }
  | {
      status: "unavailable";
      usageBytes: null;
      quotaBytes: null;
      availableBytes: null;
    };

export async function getBrowserStorageEstimate(): Promise<BrowserStorageEstimate> {
  if (typeof navigator === "undefined") return unavailableEstimate();

  try {
    const storage = navigator.storage;
    if (!storage || typeof storage.estimate !== "function") return unavailableEstimate();

    const estimate = await storage.estimate();
    if (!isByteEstimate(estimate.usage) || !isByteEstimate(estimate.quota)) {
      return {
        status: "unknown",
        usageBytes: null,
        quotaBytes: null,
        availableBytes: null,
      };
    }

    return {
      status: "available",
      usageBytes: estimate.usage,
      quotaBytes: estimate.quota,
      availableBytes: Math.max(0, estimate.quota - estimate.usage),
    };
  } catch {
    return unavailableEstimate();
  }
}

function isByteEstimate(value: number | undefined): value is number {
  return Number.isFinite(value) && value !== undefined && value >= 0;
}

function unavailableEstimate(): BrowserStorageEstimate {
  return {
    status: "unavailable",
    usageBytes: null,
    quotaBytes: null,
    availableBytes: null,
  };
}
