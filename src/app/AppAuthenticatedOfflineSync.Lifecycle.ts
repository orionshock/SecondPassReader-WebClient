import { useEffect, useMemo } from "react";
import type { SecondPassClient } from "@secondpass/client";
import type { ActiveConnection } from "../storage/ActiveConnection.Store";
import { buildOfflineCacheNamespace } from "./offline/namespace/OfflineCacheNamespace.Policy";
import {
  createOfflineReaderAuthenticatedSyncGeneration,
  startOfflineReaderAuthenticatedSyncLifecycle,
} from "./offline/reader/sync/OfflineReaderAuthenticatedSync.Lifecycle";
import { showOfflineReaderSyncOutcome } from "./offline/reader/sync/notice/OfflineReaderSyncNotice.Controller";
import { clearOfflineReaderSyncNotice } from "./offline/reader/sync/notice/OfflineReaderSyncNotice.State";
import type { AppWorkflowStep } from "./AppWorkflow.Policy";

export function useAppAuthenticatedOfflineSyncLifecycle(input: {
  workflowStep: AppWorkflowStep;
  connection: ActiveConnection | null;
  spl: SecondPassClient | null;
  requireAuthenticationRepair: () => void;
}) {
  const verifiedOfflineNamespaceKey = useMemo(() => {
    if (!input.connection?.verifiedAt) return null;
    return buildOfflineCacheNamespace({
      serverBaseUrl: input.connection.serverBaseUrl,
      accountProfileId: input.connection.verifiedUser?.profileId,
    })?.key ?? null;
  }, [input.connection?.serverBaseUrl, input.connection?.verifiedAt, input.connection?.verifiedUser?.profileId]);
  const offlineNamespaceKey = input.workflowStep === "library_home" ? verifiedOfflineNamespaceKey : null;
  const generationKey = offlineNamespaceKey && input.connection
    ? JSON.stringify([offlineNamespaceKey, input.connection.id, input.connection.verifiedAt, input.connection.accessToken])
    : null;
  const generation = useMemo(
    () => createOfflineReaderAuthenticatedSyncGeneration(),
    [generationKey],
  );

  useEffect(() => {
    clearOfflineReaderSyncNotice();
  }, [generationKey]);

  useEffect(() => {
    if (!generationKey || !offlineNamespaceKey || !input.spl) return;
    return startOfflineReaderAuthenticatedSyncLifecycle({
      namespaceKey: offlineNamespaceKey,
      client: input.spl,
      generation,
      onSweepCompleted: (result) => {
        showOfflineReaderSyncOutcome(result);
        if (result.outcome.reauthenticateBooks > 0) input.requireAuthenticationRepair();
      },
    });
  }, [generation, generationKey, input.requireAuthenticationRepair, input.spl, offlineNamespaceKey]);

  return { verifiedOfflineNamespaceKey, offlineNamespaceKey };
}
