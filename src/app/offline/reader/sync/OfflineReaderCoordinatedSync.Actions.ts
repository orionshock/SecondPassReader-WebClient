import {
  withBrowserOfflineSyncLock,
  type BrowserOfflineSyncLockManager,
  type BrowserOfflineSyncLockMode,
} from "./BrowserOfflineSyncLock.Actions";
import {
  syncOfflineReader,
  type OfflineReaderSyncInput,
  type OfflineReaderSyncResult,
} from "./OfflineReaderSync.Actions";

export type OfflineReaderCoordinatedSyncResult =
  | { status: "completed"; sync: OfflineReaderSyncResult }
  | { status: "busy" }
  | { status: "coordination-unavailable" }
  | { status: "failed" };

export type OfflineReaderCoordinatedSyncInput = OfflineReaderSyncInput & {
  mode?: BrowserOfflineSyncLockMode;
  lockManager?: BrowserOfflineSyncLockManager | null;
};

export async function syncOfflineReaderWithCrossTabCoordination(
  input: OfflineReaderCoordinatedSyncInput,
): Promise<OfflineReaderCoordinatedSyncResult> {
  const result = await withBrowserOfflineSyncLock({
    namespaceKey: input.namespaceKey,
    bookId: input.bookId,
    mode: input.mode,
    lockManager: input.lockManager,
    run: () => syncOfflineReader(input),
  });

  return result.status === "completed"
    ? { status: "completed", sync: result.value }
    : result;
}
