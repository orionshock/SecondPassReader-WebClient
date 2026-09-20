import { ApiTransportError, type SecondPassClient, type SecondPassDiscovery } from "@secondpass/client";
import { createSplClientFromConnection } from "../../app/AppSplClient.Factory";
import { isAuthenticationRepairError, isAuthorizationError } from "../../app/AppUserFacingErrors.Mapper";
import {
  beginActiveConnectionPublication,
  isActiveConnectionPublicationCurrent,
  publishActiveConnectionResult,
  saveActiveConnection,
  type ActiveConnection,
} from "../../storage/ActiveConnection.Store";
import { loadAuthenticatedContext, type AuthenticatedContext } from "./AuthenticatedContext.Queries";
import { applyAuthenticatedContextToConnection } from "./ConnectionAccountProfile.Mapper";
import { toConnectionDiscoveryMetadata } from "./ConnectionDiscovery.Mapper";
import { ConnectionSetupError, discoverSecondPass, normalizeServerBaseUrl } from "./ConnectionServer.Queries";

export type ManualRouteRepairResult =
  | { status: "verified"; routeChanged: boolean }
  | { status: "invalid-url"; message: string }
  | { status: "server-mismatch" }
  | { status: "profile-mismatch" }
  | { status: "authorization-failed"; authenticationRejected: boolean }
  | { status: "unavailable" }
  | { status: "failed"; error: unknown }
  | { status: "stale" };

// Explicit user intent: verify only the entered route, then publish against the exact saved record.
export async function repairConnectionRoute(input: {
  connection: ActiveConnection;
  enteredUrl: string;
  signal?: AbortSignal;
  onConnectionChanged?: () => void;
  discover?: (route: string, signal?: AbortSignal) => Promise<SecondPassDiscovery>;
  createClient?: (connection: ActiveConnection) => SecondPassClient;
  loadContext?: (client: SecondPassClient, signal?: AbortSignal) => Promise<AuthenticatedContext>;
  save?: (connection: ActiveConnection) => void;
  now?: () => string;
}): Promise<ManualRouteRepairResult> {
  let route: string;
  try {
    route = normalizeServerBaseUrl(input.enteredUrl).serverBaseUrl;
  } catch (error) {
    return error instanceof ConnectionSetupError
      ? { status: "invalid-url", message: error.message }
      : { status: "failed", error };
  }

  const { connection } = input;
  if (!connection.accessToken || !connection.verifiedAt || !connection.verifiedUser?.profileId) {
    return { status: "authorization-failed", authenticationRejected: true };
  }
  if (input.signal?.aborted) return { status: "stale" };
  const publication = beginActiveConnectionPublication(connection);
  if (!publication) return { status: "stale" };
  const current = () => isActiveConnectionPublicationCurrent(publication) && !input.signal?.aborted;

  try {
    const discovery = await (input.discover ?? discoverSecondPass)(route, input.signal);
    if (!current()) return { status: "stale" };
    if (discovery.serverId.toLowerCase() !== connection.serverId.toLowerCase()) return { status: "server-mismatch" };

    const candidate = { ...connection, serverBaseUrl: route, clientApi: toConnectionDiscoveryMetadata(discovery).clientApi };
    const client = (input.createClient ?? createSplClientFromConnection)(candidate);
    const { currentUser, serverInfo } = await (input.loadContext ?? loadAuthenticatedContext)(client, input.signal);
    if (!current()) return { status: "stale" };
    if (serverInfo.serverId.toLowerCase() !== connection.serverId.toLowerCase()) return { status: "server-mismatch" };
    if (currentUser.profileId !== connection.verifiedUser.profileId) return { status: "profile-mismatch" };

    const updated = applyAuthenticatedContextToConnection(
      candidate, currentUser, serverInfo, (input.now ?? (() => new Date().toISOString()))(),
    );
    const published = publishActiveConnectionResult(publication, () => {
      (input.save ?? saveActiveConnection)(updated);
      input.onConnectionChanged?.();
    });
    return published ? { status: "verified", routeChanged: route !== connection.serverBaseUrl } : { status: "stale" };
  } catch (error) {
    if (!current()) return { status: "stale" };
    if (isAuthorizationError(error)) {
      return { status: "authorization-failed", authenticationRejected: isAuthenticationRepairError(error) };
    }
    return isUnavailable(error) ? { status: "unavailable" } : { status: "failed", error };
  }
}

function isUnavailable(error: unknown): boolean {
  if (error instanceof ApiTransportError) return true;
  return error instanceof Error && "cause" in error && error.cause !== error && isUnavailable(error.cause);
}
