import type { SecondPassClient } from "@secondpass/client";
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
import {
  beginActiveConnectionPublication,
  isActiveConnectionPublicationCurrent,
  publishActiveConnectionResult,
  type ConnectionProfile,
} from "../../storage/ConnectionProfiles.Store";

export type ConnectionRemovalResult =
  | { status: "removed" }
  | { status: "cancelled" }
  | { status: "superseded" }
  | {
      status: "failed";
      stage: "inspect" | "remote" | "cleanup";
      remoteCompleted: boolean;
      error?: unknown;
    };

export type RemoteClientSession = {
  client: Pick<SecondPassClient, "account">;
  clientSessionId: string;
};

// Keeps the verified connection available until destructive local cleanup succeeds,
// so a failed cleanup can be retried instead of leaving inaccessible personal data.
export async function removeConnectionAndOfflineData(input: {
  expectedConnection: ConnectionProfile;
  intent: OfflineNamespaceRemovalIntent;
  namespaceKey: string | null;
  client: OfflineReaderSyncClient | null;
  connectivity: BrowserConnectivityStatus;
  confirm(message: string): boolean;
  onRemoved(): void;
  remoteSession?: RemoteClientSession;
  inspectNamespace?: typeof inspectOfflineNamespace;
  removeNamespace?: typeof removeOfflineNamespace;
  syncPending?: typeof syncPendingOfflineReaderWork;
}): Promise<ConnectionRemovalResult> {
  const publication = beginActiveConnectionPublication(input.expectedConnection);
  if (!publication) return { status: "superseded" };
  const namespaceKey = input.namespaceKey?.trim() ?? "";
  if (!namespaceKey) {
    const question = input.intent === "sign-out" ? "Sign out of this browser?" : "Forget this connection?";
    if (!input.confirm(question)) return { status: "cancelled" };
    if (input.remoteSession) {
      try {
        await revokeRemoteSession(input.remoteSession);
      } catch (error) {
        if (!isActiveConnectionPublicationCurrent(publication)) return { status: "superseded" };
        return { status: "failed", stage: "remote", remoteCompleted: false, error };
      }
    }
    return publishActiveConnectionResult(publication, input.onRemoved)
      ? { status: "removed" }
      : { status: "superseded" };
  }

  const inspect = input.inspectNamespace ?? inspectOfflineNamespace;
  let summary: OfflineNamespaceRetentionSummary | null;
  try {
    summary = await inspect(namespaceKey);
  } catch (error) {
    if (!isActiveConnectionPublicationCurrent(publication)) return { status: "superseded" };
    return { status: "failed", stage: "inspect", remoteCompleted: false, error };
  }
  if (!isActiveConnectionPublicationCurrent(publication)) return { status: "superseded" };
  if (!summary) return { status: "failed", stage: "inspect", remoteCompleted: false };

  if (summary.pendingIntents > 0 && input.connectivity === "online" && input.client) {
    // Sign-out gets one foreground delivery attempt; remaining work is still covered by the destructive confirmation.
    try {
      const syncPending = input.syncPending ?? syncPendingOfflineReaderWork;
      await syncPending({ namespaceKey, client: input.client, mode: "wait" });
    } catch (error) {
      debugWarn("reader", "pending Reader sync before connection removal did not complete", { error });
    }
    try {
      summary = await inspect(namespaceKey);
    } catch (error) {
      if (!isActiveConnectionPublicationCurrent(publication)) return { status: "superseded" };
      return { status: "failed", stage: "inspect", remoteCompleted: false, error };
    }
    if (!isActiveConnectionPublicationCurrent(publication)) return { status: "superseded" };
    if (!summary) return { status: "failed", stage: "inspect", remoteCompleted: false };
  }

  if (!input.confirm(offlineNamespaceRemovalConfirmation(summary, input.intent))) return { status: "cancelled" };

  let remoteCompleted = false;
  if (input.remoteSession) {
    try {
      await revokeRemoteSession(input.remoteSession);
      remoteCompleted = true;
    } catch (error) {
      if (!isActiveConnectionPublicationCurrent(publication)) return { status: "superseded" };
      return { status: "failed", stage: "remote", remoteCompleted: false, error };
    }
  }

  const result = await (input.removeNamespace ?? removeOfflineNamespace)(namespaceKey);
  if (!isActiveConnectionPublicationCurrent(publication)) return { status: "superseded" };
  if (result.status !== "removed") {
    return { status: "failed", stage: "cleanup", remoteCompleted };
  }
  return publishActiveConnectionResult(publication, input.onRemoved)
    ? { status: "removed" }
    : { status: "superseded" };
}

function revokeRemoteSession(session: RemoteClientSession): Promise<void> {
  return session.client.account.revokeClientSession(session.clientSessionId);
}
