export type PersistentStorageRequestResult = {
  status: "already-granted" | "granted" | "denied" | "unsupported" | "failed";
};

export async function requestBrowserPersistentStorage(): Promise<PersistentStorageRequestResult> {
  let storage: StorageManager | null;
  try {
    storage = typeof navigator === "undefined" ? null : navigator.storage ?? null;
  } catch {
    return { status: "failed" };
  }

  if (!storage) return { status: "unsupported" };

  try {
    if (typeof storage.persisted === "function") {
      const alreadyGranted = await storage.persisted();
      if (typeof alreadyGranted !== "boolean") return { status: "failed" };
      if (alreadyGranted) return { status: "already-granted" };
    }

    if (typeof storage.persist !== "function") return { status: "unsupported" };

    const granted = await storage.persist();
    if (typeof granted !== "boolean") return { status: "failed" };
    return { status: granted ? "granted" : "denied" };
  } catch {
    return { status: "failed" };
  }
}
