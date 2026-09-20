import { useCallback, useEffect, useRef } from "react";
import type { SecondPassClient } from "@secondpass/client";
import type { ActiveConnection } from "../storage/ActiveConnection.Store";
import {
  beginActiveConnectionPublication,
  publishActiveConnectionResult,
  saveActiveConnection,
} from "../storage/ActiveConnection.Store";
import { applyAuthenticatedContextToConnection, hasCurrentAccountChanged, ServerIdentityMismatchError } from "../features/connection/ConnectionAccountProfile.Mapper";
import { markConnectionRepairRequired } from "../features/connection/ConnectionRepair.State";
import { debugWarn } from "../lib/debug/DebugLogger.Diagnostics";
import { loadAuthenticatedContext } from "../features/connection/AuthenticatedContext.Queries";
import type { AppWorkflowStep } from "./AppWorkflow.Policy";

export function useAppAuthenticatedContextController({
  workflowStep,
  connection,
  spl,
  clearAuthorizationFailure,
  reportAuthorizationFailure,
  onConnectionChanged,
}: {
  workflowStep: AppWorkflowStep;
  connection: ActiveConnection | null;
  spl: SecondPassClient | null;
  clearAuthorizationFailure: () => void;
  reportAuthorizationFailure: (error: unknown) => void;
  onConnectionChanged: () => void;
}) {
  const lastCheckRef = useRef<Record<string, number>>({});

  const checkAuthenticatedContext = useCallback(async () => {
    // Keep verified user display fresh on page load and periodic focus changes.
    if (workflowStep !== "library_home") return;
    if (!connection?.id) return;
    if (!connection.serverId || !connection.accessToken || !spl) return;

    const connectionId = connection.id;
    const refreshIdentity = JSON.stringify([connectionId, connection.serverId, connection.serverBaseUrl, connection.accessToken]);
    const now = Date.now();
    const last = lastCheckRef.current[refreshIdentity] ?? 0;
    if (now - last < 60_000) return; // throttle (avoid spamming)
    lastCheckRef.current[refreshIdentity] = now;
    const publication = beginActiveConnectionPublication(connection);
    if (!publication) return;

    try {
      const { currentUser, serverInfo } = await loadAuthenticatedContext(spl);
      const nextConnection = applyAuthenticatedContextToConnection(
        connection,
        currentUser,
        serverInfo,
        new Date().toISOString(),
        { markVerified: false },
      );
      const changed = hasCurrentAccountChanged(connection, nextConnection);
      publishActiveConnectionResult(publication, () => {
        clearAuthorizationFailure();
        if (!changed) return;
        saveActiveConnection(nextConnection);
        onConnectionChanged();
      });
    } catch (error) {
      if (error instanceof ServerIdentityMismatchError) {
        publishActiveConnectionResult(publication, () => {
          debugWarn("reader", "[SPR connection] authenticated server ID changed at the current route", {
            serverId: connection.serverId,
            serverBaseUrl: connection.serverBaseUrl,
          });
          saveActiveConnection(markConnectionRepairRequired(connection));
          onConnectionChanged();
        });
        return;
      }
      publishActiveConnectionResult(publication, () => reportAuthorizationFailure(error));
      // Auth failure enters repair without destroying the last verified namespace.
    }
  }, [clearAuthorizationFailure, onConnectionChanged, connection, reportAuthorizationFailure, spl, workflowStep]);

  useEffect(() => {
    void checkAuthenticatedContext();
  }, [checkAuthenticatedContext]);

  useEffect(() => {
    if (workflowStep !== "library_home") return;
    const onFocus = () => {
      void checkAuthenticatedContext();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [checkAuthenticatedContext, workflowStep]);
}
