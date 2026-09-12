import type { OfflinePublicationAssetCompleteRecord } from "../storage/OfflineRepositories.Types";
import type { ReaderOutboxIntent } from "../reader/outbox/ReaderOutbox.Policy";

export type OfflineNamespaceRetentionSummary = {
  pendingBooks: number;
  pendingIntents: number;
  offlineAssetCount: number;
  offlineAssetBytes: number;
};

export function summarizeOfflineNamespaceRetention(
  intents: readonly ReaderOutboxIntent[],
  assets: readonly OfflinePublicationAssetCompleteRecord<unknown>[],
): OfflineNamespaceRetentionSummary {
  return {
    pendingBooks: new Set(intents.map((intent) => intent.bookId)).size,
    pendingIntents: intents.length,
    offlineAssetCount: assets.length,
    offlineAssetBytes: assets.reduce((total, asset) => total + asset.byteLength, 0),
  };
}

export function offlineNamespaceRemovalConfirmation(summary: OfflineNamespaceRetentionSummary): string {
  const consequences = [
    summary.pendingIntents > 0
      ? "Unsynced reading changes will be permanently discarded."
      : null,
    summary.offlineAssetCount > 0
      ? "Offline copies will be removed."
      : null,
    "Reading progress and annotations saved only in this browser will be removed.",
  ].filter(Boolean);
  return `Forget this connection and remove its local data? ${consequences.join(" ")}`;
}
