import { useCallback, useEffect, useRef } from "react";
import type { SecondPassClient } from "@secondpass/client";
import type { ActiveConnection } from "../storage/ActiveConnection.Store";
import { beginActiveConnectionPublication, publishActiveConnectionResult, saveActiveConnection } from "../storage/ActiveConnection.Store";
import { debugWarn } from "../lib/debug/DebugLogger.Diagnostics";
import { recoverConnectionRoute } from "../features/connection/ConnectionRouteRecovery.Controller";
import { markConnectionRepairRequired } from "../features/connection/ConnectionRepair.State";
import { createSplClientFromConnection } from "./AppSplClient.Factory";
import type { BrowserConnectivityStatus } from "./connectivity/BrowserConnectivity.State";
import type { AppWorkflowStep } from "./AppWorkflow.Policy";

export function useAppAuthenticatedContextController({
  workflowStep,
  connection,
  spl,
  clearAuthorizationFailure,
  reportAuthorizationFailure,
  onConnectionChanged,
  connectivity = "unknown",
  onRouteRecoveryStateChange,
}: {
  workflowStep: AppWorkflowStep;
  connection: ActiveConnection | null;
  spl: SecondPassClient | null;
  clearAuthorizationFailure: () => void;
  reportAuthorizationFailure: (error: unknown) => void;
  onConnectionChanged: () => void;
  connectivity?: BrowserConnectivityStatus;
  onRouteRecoveryStateChange?: (state: "idle" | "trying" | "unavailable") => void;
}) {
  const lastCheckRef = useRef<Record<string, number>>({});
  const priorConnectivityRef = useRef(connectivity);
  const activeRecoveryRef = useRef<AbortController | null>(null);

  const checkAuthenticatedContext = useCallback(async (force = false) => {
    // Keep verified user display fresh on page load and periodic focus changes.
    if (workflowStep !== "library_home") return;
    if (!connection?.id) return;
    if (!connection.serverId || !connection.accessToken || !spl) return;
    if (connectivity === "offline") return;

    const connectionId = connection.id;
    const refreshIdentity = JSON.stringify([connectionId, connection.serverId, connection.serverBaseUrl, connection.accessToken]);
    const now = Date.now();
    const last = lastCheckRef.current[refreshIdentity] ?? 0;
    if (!force && now - last < 60_000) return; // throttle focus checks
    lastCheckRef.current[refreshIdentity] = now;
    activeRecoveryRef.current?.abort();
    const recovery = new AbortController();
    activeRecoveryRef.current = recovery;
    let result: Awaited<ReturnType<typeof recoverConnectionRoute>>;
    try {
      result = await recoverConnectionRoute({
        connection,
        signal: recovery.signal,
        markVerified: false,
        createClient: (candidate) => candidate.serverBaseUrl === connection.serverBaseUrl
          ? spl : createSplClientFromConnection(candidate),
        onConnectionChanged,
        onTryingAlternate: () => onRouteRecoveryStateChange?.("trying"),
      });
    } finally {
      if (activeRecoveryRef.current === recovery) activeRecoveryRef.current = null;
    }
    if (result.status === "stale") return;
    if (result.status === "verified") {
      clearAuthorizationFailure();
      onRouteRecoveryStateChange?.("idle");
    } else if (result.status === "unavailable") {
      onRouteRecoveryStateChange?.("unavailable");
    } else if (result.status === "authorization-failed") {
      onRouteRecoveryStateChange?.("idle");
      reportAuthorizationFailure(result.error);
    } else if (result.status === "identity-mismatch" || result.status === "profile-mismatch") {
      debugWarn("reader", `[SPR connection] authenticated ${result.status === "identity-mismatch" ? "server" : "profile"} ID changed at the current route`, {
        serverId: connection.serverId,
        serverBaseUrl: connection.serverBaseUrl,
      });
      const publication = beginActiveConnectionPublication(connection);
      if (publication) publishActiveConnectionResult(publication, () => {
        saveActiveConnection(markConnectionRepairRequired(connection));
        onConnectionChanged();
      });
    }
  }, [clearAuthorizationFailure, connectivity, onConnectionChanged, onRouteRecoveryStateChange, connection, reportAuthorizationFailure, spl, workflowStep]);

  useEffect(() => {
    if (connectivity === "offline" || workflowStep !== "library_home") activeRecoveryRef.current?.abort();
  }, [connectivity, workflowStep]);

  useEffect(() => () => activeRecoveryRef.current?.abort(), [connection?.id, connection?.serverId, connection?.serverBaseUrl, connection?.accessToken]);

  useEffect(() => {
    if (priorConnectivityRef.current !== connectivity) return;
    void checkAuthenticatedContext();
  }, [checkAuthenticatedContext, connectivity]);

  useEffect(() => {
    const previous = priorConnectivityRef.current;
    priorConnectivityRef.current = connectivity;
    if (previous !== "online" && connectivity === "online") void checkAuthenticatedContext(true);
  }, [checkAuthenticatedContext, connectivity]);

  useEffect(() => {
    if (workflowStep !== "library_home") return;
    const onFocus = () => {
      void checkAuthenticatedContext();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [checkAuthenticatedContext, workflowStep]);
}
