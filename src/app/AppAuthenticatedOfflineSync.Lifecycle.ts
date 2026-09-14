import { useEffect, useMemo } from "react";
import type { SecondPassClient } from "@secondpass/client";
import type { ConnectionProfile } from "../storage/ConnectionProfiles.Store";
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
  profile: ConnectionProfile | null;
  spl: SecondPassClient | null;
  requireAuthenticationRepair: () => void;
}) {
  const verifiedOfflineNamespaceKey = useMemo(() => {
    if (!input.profile?.verifiedAt) return null;
    return buildOfflineCacheNamespace({
      serverBaseUrl: input.profile.serverBaseUrl,
      accountProfileId: input.profile.verifiedUser?.profileId,
    })?.key ?? null;
  }, [input.profile?.serverBaseUrl, input.profile?.verifiedAt, input.profile?.verifiedUser?.profileId]);
  const offlineNamespaceKey = input.workflowStep === "library_home" ? verifiedOfflineNamespaceKey : null;
  const generationKey = offlineNamespaceKey && input.profile
    ? JSON.stringify([offlineNamespaceKey, input.profile.id, input.profile.verifiedAt])
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
