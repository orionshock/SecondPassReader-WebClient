import type { OfflineReaderPendingSyncResult } from "../OfflineReaderPendingSync.Actions";
import { presentOfflineReaderSyncNotice } from "./OfflineReaderSyncNotice.Presenter";
import { showOfflineReaderSyncNotice } from "./OfflineReaderSyncNotice.State";

export function showOfflineReaderSyncOutcome(result: OfflineReaderPendingSyncResult): void {
  const notice = presentOfflineReaderSyncNotice(result);
  if (notice) showOfflineReaderSyncNotice(notice);
}
