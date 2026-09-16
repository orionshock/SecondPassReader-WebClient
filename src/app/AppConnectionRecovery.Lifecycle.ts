import { useEffect, useRef } from "react";
import type { AppRoute } from "./AppNavigation.Router";
import type { ActiveConnection } from "../storage/ActiveConnection.Store";
import {
  beginActiveConnectionPublication,
  publishActiveConnectionResult,
  saveActiveConnection,
} from "../storage/ActiveConnection.Store";
import { markConnectionRepairRequired } from "../features/connection/ConnectionRepair.State";

export function useAppConnectionRecoveryLifecycle(input: {
  route: AppRoute | null;
  connection: ActiveConnection | null;
  authenticationRepairRequired: boolean;
  clearAuthorizationFailure: () => void;
  onConnectionChanged: () => void;
}): void {
  const connectionId = input.connection?.id ?? null;
  const connectionIdentityRef = useRef(`${connectionId ?? ""}:${input.connection?.accessToken ?? ""}`);

  useEffect(() => {
    const nextIdentity = `${connectionId ?? ""}:${input.connection?.accessToken ?? ""}`;
    if (connectionIdentityRef.current !== nextIdentity) input.clearAuthorizationFailure();
    connectionIdentityRef.current = nextIdentity;
  }, [input.clearAuthorizationFailure, input.connection?.accessToken, connectionId]);

  useEffect(() => {
    if (input.route?.kind === "settings" && input.route.tab === "library-server") {
      input.clearAuthorizationFailure();
    }
  }, [input.clearAuthorizationFailure, input.route]);

  useEffect(() => {
    if (!input.authenticationRepairRequired || !input.connection) return;
    if (input.connection.authenticationState === "repair-required") return;
    const connection = input.connection;
    const publication = beginActiveConnectionPublication(connection);
    if (!publication) return;
    publishActiveConnectionResult(publication, () => {
      saveActiveConnection(markConnectionRepairRequired(connection));
      input.onConnectionChanged();
    });
  }, [input.authenticationRepairRequired, input.onConnectionChanged, input.connection]);
}
