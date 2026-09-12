import { useSyncExternalStore } from "react";
import {
  dismissOfflineReaderSyncNotice,
  getOfflineReaderSyncNoticeSnapshot,
  subscribeToOfflineReaderSyncNotice,
} from "./OfflineReaderSyncNotice.State";

export function OfflineReaderSyncNoticePanel() {
  const snapshot = useSyncExternalStore(
    subscribeToOfflineReaderSyncNotice,
    getOfflineReaderSyncNoticeSnapshot,
    getOfflineReaderSyncNoticeSnapshot,
  );
  if (!snapshot) return null;

  return (
    <section
      className={`offlineReaderSyncNotice offlineReaderSyncNotice-${snapshot.notice.severity}`}
      role="status"
      aria-live="polite"
    >
      <p>{snapshot.notice.message}</p>
      <button
        type="button"
        className="button buttonCompact"
        onClick={() => dismissOfflineReaderSyncNotice(snapshot.id)}
        aria-label="Dismiss sync message"
      >
        Dismiss
      </button>
    </section>
  );
}
