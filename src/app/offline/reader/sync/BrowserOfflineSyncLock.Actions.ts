export type BrowserOfflineSyncLockMode = "wait" | "if-available";

export type BrowserOfflineSyncLockManager = {
  request<T>(
    name: string,
    options: { mode: "exclusive"; ifAvailable?: boolean },
    callback: (lock: { name: string } | null) => Promise<T>,
  ): Promise<T>;
};

export type BrowserOfflineSyncLockResult<T> =
  | { status: "completed"; value: T }
  | { status: "busy" }
  | { status: "coordination-unavailable" }
  | { status: "failed" };

type LockInput<T> = {
  namespaceKey: string;
  bookId: string;
  mode?: BrowserOfflineSyncLockMode;
  run: () => Promise<T>;
  lockManager?: BrowserOfflineSyncLockManager | null;
};

export async function withBrowserOfflineSyncLock<T>(
  input: LockInput<T>,
): Promise<BrowserOfflineSyncLockResult<T>> {
  const lockName = buildBrowserOfflineSyncLockName(input.namespaceKey, input.bookId);
  if (!lockName) return { status: "failed" };

  const lockManager = input.lockManager === undefined ? getBrowserLockManager() : input.lockManager;
  if (!lockManager) return { status: "coordination-unavailable" };

  try {
    return await lockManager.request(
      lockName,
      input.mode === "if-available"
        ? { mode: "exclusive", ifAvailable: true }
        : { mode: "exclusive" },
      async (lock) => lock
        ? { status: "completed", value: await input.run() }
        : { status: "busy" },
    );
  } catch {
    return { status: "failed" };
  }
}

export function buildBrowserOfflineSyncLockName(namespaceKey: string, bookId: string): string | null {
  const namespace = namespaceKey.trim();
  const book = bookId.trim();
  if (!namespace || !book) return null;
  return `secondpass-reader-sync:${encodeURIComponent(namespace)}:book:${encodeURIComponent(book)}`;
}

function getBrowserLockManager(): BrowserOfflineSyncLockManager | null {
  if (typeof navigator === "undefined" || !("locks" in navigator)) return null;
  return navigator.locks;
}
