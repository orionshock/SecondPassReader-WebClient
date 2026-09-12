import type { OfflineReaderSyncClient } from "../../app/offline/reader/sync/OfflineReaderSync.Actions";
import { syncPendingOfflineReaderWork } from "../../app/offline/reader/sync/OfflineReaderPendingSync.Actions";
import type { BrowserConnectivityStatus } from "../../app/connectivity/BrowserConnectivity.State";
import {
  inspectOfflineNamespace,
  removeOfflineNamespace,
} from "../../app/offline/namespace/OfflineNamespaceCleanup.Actions";
import {
  offlineNamespaceRemovalConfirmation,
  type OfflineNamespaceRetentionSummary,
  type OfflineNamespaceRemovalIntent,
} from "../../app/offline/namespace/OfflineNamespaceRetention.Presenter";
import { debugWarn } from "../../lib/debug/DebugLogger.Diagnostics";

export type ConnectionRemovalResult =
  | { status: "removed" }
  | { status: "cancelled" }
  | {
      status: "failed";
      stage: "inspect" | "remote" | "cleanup";
      remoteCompleted: boolean;
      error?: unknown;
    };

export async function removeConnectionAndOfflineData(input: {
  intent: OfflineNamespaceRemovalIntent;
  namespaceKey: string | null;
  client: OfflineReaderSyncClient | null;
  connectivity: BrowserConnectivityStatus;
  confirm(message: string): boolean;
  onRemoved(): void;
  removeRemoteConnection?(): Promise<void>;
  inspectNamespace?: typeof inspectOfflineNamespace;
  removeNamespace?: typeof removeOfflineNamespace;
  syncPending?: typeof syncPendingOfflineReaderWork;
}): Promise<ConnectionRemovalResult> {
  const namespaceKey = input.namespaceKey?.trim() ?? "";
  if (!namespaceKey) {
    const question = input.intent === "sign-out" ? "Sign out of this browser?" : "Forget this connection?";
    if (!input.confirm(question)) return { status: "cancelled" };
    if (input.removeRemoteConnection) {
      try {
        await input.removeRemoteConnection();
      } catch (error) {
        return { status: "failed", stage: "remote", remoteCompleted: false, error };
      }
    }
    input.onRemoved();
    return { status: "removed" };
  }

  const inspect = input.inspectNamespace ?? inspectOfflineNamespace;
  let summary: OfflineNamespaceRetentionSummary | null;
  try {
    summary = await inspect(namespaceKey);
  } catch (error) {
    return { status: "failed", stage: "inspect", remoteCompleted: false, error };
  }
  if (!summary) return { status: "failed", stage: "inspect", remoteCompleted: false };

  if (summary.pendingIntents > 0 && input.connectivity === "online" && input.client) {
    try {
      const syncPending = input.syncPending ?? syncPendingOfflineReaderWork;
      await syncPending({ namespaceKey, client: input.client, mode: "wait" });
    } catch (error) {
      debugWarn("reader", "pending Reader sync before connection removal did not complete", { error });
    }
    try {
      summary = await inspect(namespaceKey);
    } catch (error) {
      return { status: "failed", stage: "inspect", remoteCompleted: false, error };
    }
    if (!summary) return { status: "failed", stage: "inspect", remoteCompleted: false };
  }

  if (!input.confirm(offlineNamespaceRemovalConfirmation(summary, input.intent))) return { status: "cancelled" };

  let remoteCompleted = false;
  if (input.removeRemoteConnection) {
    try {
      await input.removeRemoteConnection();
      remoteCompleted = true;
    } catch (error) {
      return { status: "failed", stage: "remote", remoteCompleted: false, error };
    }
  }

  const result = await (input.removeNamespace ?? removeOfflineNamespace)(namespaceKey);
  if (result.status !== "removed") {
    return { status: "failed", stage: "cleanup", remoteCompleted };
  }
  input.onRemoved();
  return { status: "removed" };
}
