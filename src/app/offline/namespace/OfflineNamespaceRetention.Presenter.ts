import type { OfflinePublicationAssetCompleteRecord } from "../storage/OfflineRepositories.Types";
import { getOfflinePublicationPayloadBytes } from "../publication/OfflinePublicationAsset.Policy";
import type { ReaderOutboxIntent } from "../reader/outbox/ReaderOutbox.Policy";

export type OfflineNamespaceRetentionSummary = {
  pendingBooks: number;
  pendingIntents: number;
  offlineAssetCount: number;
  offlineAssetBytes: number;
};

export function summarizeOfflineNamespaceRetention(
  intents: readonly ReaderOutboxIntent[],
  assets: readonly OfflinePublicationAssetCompleteRecord<Blob>[],
): OfflineNamespaceRetentionSummary {
  return {
    pendingBooks: new Set(intents.map((intent) => intent.bookId)).size,
    pendingIntents: intents.length,
    offlineAssetCount: assets.length,
    offlineAssetBytes: assets.reduce((total, asset) => total + getOfflinePublicationPayloadBytes(asset), 0),
  };
}

export type OfflineNamespaceRemovalIntent = "sign-out" | "forget";

export function offlineNamespaceRemovalConfirmation(
  summary: OfflineNamespaceRetentionSummary,
  intent: OfflineNamespaceRemovalIntent,
): string {
  const action = intent === "sign-out" ? "Signing out" : "Forgetting this connection";
  const consequences = [
    summary.pendingIntents > 0
      ? `Some reading changes haven't synced. ${action} now will discard them.`
      : null,
    summary.offlineAssetCount > 0
      ? "Offline copies will be removed."
      : null,
    "Reading progress and annotations saved only in this browser will be removed.",
  ].filter(Boolean);
  const question = intent === "sign-out"
    ? "Sign out and remove this connection's offline data from this browser?"
    : "Forget this connection and remove its offline data from this browser?";
  return `${question} ${consequences.join(" ")}`;
}
