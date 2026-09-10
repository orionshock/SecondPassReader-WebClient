import type { OfflineReaderSyncClient } from "../../app/offline/reader/sync/OfflineReaderSync.Actions";
import type { BrowserConnectivityStatus } from "../../app/connectivity/BrowserConnectivity.State";
import {
  inspectOfflineNamespace,
  removeOfflineNamespace,
} from "../../app/offline/namespace/OfflineNamespaceCleanup.Actions";
import { offlineNamespaceRemovalConfirmation } from "../../app/offline/namespace/OfflineNamespaceRetention.Presenter";

export type ForgetConnectionResult =
  | { status: "removed" }
  | { status: "cancelled" }
  | { status: "failed" };

export async function forgetConnectionAndOfflineData(input: {
  namespaceKey: string | null;
  client: OfflineReaderSyncClient | null;
  connectivity: BrowserConnectivityStatus;
  confirm(message: string): boolean;
  onRemoved(): void;
  inspectNamespace?: typeof inspectOfflineNamespace;
  removeNamespace?: typeof removeOfflineNamespace;
  syncPending?: typeof import("../../app/offline/reader/sync/OfflineReaderPendingSync.Actions")["syncPendingOfflineReaderWork"];
}): Promise<ForgetConnectionResult> {
  const namespaceKey = input.namespaceKey?.trim() ?? "";
  if (!namespaceKey) {
    if (!input.confirm("Forget this saved connection?")) return { status: "cancelled" };
    input.onRemoved();
    return { status: "removed" };
  }

  const inspect = input.inspectNamespace ?? inspectOfflineNamespace;
  let summary = await inspect(namespaceKey);
  if (!summary) return { status: "failed" };

  if (summary.pendingIntents > 0 && input.connectivity === "online" && input.client) {
    const syncPending = input.syncPending
      ?? (await import("../../app/offline/reader/sync/OfflineReaderPendingSync.Actions")).syncPendingOfflineReaderWork;
    await syncPending({ namespaceKey, client: input.client, mode: "wait" });
    summary = await inspect(namespaceKey);
    if (!summary) return { status: "failed" };
  }

  if (!input.confirm(offlineNamespaceRemovalConfirmation(summary))) return { status: "cancelled" };
  const result = await (input.removeNamespace ?? removeOfflineNamespace)(namespaceKey);
  if (result.status !== "removed") return { status: "failed" };
  input.onRemoved();
  return { status: "removed" };
}
