import { ApiTransportError, normalizeLibraryBaseUrl, type CurrentUser, type SecondPassDiscovery, type SecondPassClient } from "@secondpass/client";
import { createSplClientFromConnection } from "../../app/AppSplClient.Factory";
import { isAuthenticationRepairError, isAuthorizationError } from "../../app/AppUserFacingErrors.Mapper";
import { debugWarn } from "../../lib/debug/DebugLogger.Diagnostics";
import {
  beginActiveConnectionPublication,
  isActiveConnectionPublicationCurrent,
  publishActiveConnectionResult,
  saveActiveConnection,
  type ActiveConnection,
} from "../../storage/ActiveConnection.Store";
import { loadAuthenticatedContext, type AuthenticatedContext } from "./AuthenticatedContext.Queries";
import { applyAuthenticatedContextToConnection, hasCurrentAccountChanged, ServerIdentityMismatchError } from "./ConnectionAccountProfile.Mapper";
import { discoverSecondPass } from "./ConnectionServer.Queries";

const ROUTE_PROBE_TIMEOUT_MS = 10_000;
class RouteProbeTimeoutError extends Error {}

export type ConnectionRouteRecoveryResult =
  | { status: "verified"; currentUser: CurrentUser; routeChanged: boolean; connectionChanged: boolean }
  | { status: "unavailable"; mismatchedCandidates: number }
  | { status: "authorization-failed"; error: unknown; authenticationRejected: boolean }
  | { status: "identity-mismatch" }
  | { status: "profile-mismatch" }
  | { status: "failed"; error: unknown }
  | { status: "stale" };

export function orderedConnectionRoutes(connection: ActiveConnection): string[] {
  const seen = new Set<string>();
  return [connection.serverBaseUrl, ...connection.serverUrls].filter((route) => {
    const normalized = normalizeLibraryBaseUrl(route);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function isRouteTransportFailure(error: unknown): boolean {
  if (isAbortError(error)) return false;
  if (error instanceof ApiTransportError) return true;
  if (error instanceof RouteProbeTimeoutError) return true;
  if (error instanceof Error && "cause" in error && error.cause !== error) {
    return isRouteTransportFailure(error.cause);
  }
  return false;
}

function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") return true;
  return error instanceof Error && "cause" in error && error.cause !== error && isAbortError(error.cause);
}

// One bounded pass over the saved routes. Only transport failure at the current route starts
// alternate probing; each alternate must pass anonymous and authenticated identity checks.
export async function recoverConnectionRoute(input: {
  connection: ActiveConnection;
  markVerified?: boolean;
  onTryingAlternate?: () => void;
  onConnectionChanged?: () => void;
  signal?: AbortSignal;
  discover?: (route: string, signal?: AbortSignal) => Promise<SecondPassDiscovery>;
  createClient?: (connection: ActiveConnection) => SecondPassClient;
  loadContext?: (client: SecondPassClient, signal?: AbortSignal) => Promise<AuthenticatedContext>;
  save?: (connection: ActiveConnection) => void;
  now?: () => string;
}): Promise<ConnectionRouteRecoveryResult> {
  const { connection } = input;
  if (!connection.accessToken || !connection.verifiedUser?.profileId || !connection.verifiedAt) {
    return { status: "failed", error: new Error("Connection has no verified account.") };
  }
  const publication = beginActiveConnectionPublication(connection);
  if (!publication) return { status: "stale" };
  const current = () => isActiveConnectionPublicationCurrent(publication);
  const createClient = input.createClient ?? createSplClientFromConnection;
  const loadContext = input.loadContext ?? loadAuthenticatedContext;
  const discover = input.discover ?? discoverSecondPass;
  const routes = orderedConnectionRoutes(connection);
  let mismatchedCandidates = 0;

  for (const [index, route] of routes.entries()) {
    if (!current() || input.signal?.aborted) return { status: "stale" };
    const candidateAbort = new AbortController();
    let candidateSucceeded = false;
    const cancelCandidate = () => candidateAbort.abort();
    input.signal?.addEventListener("abort", cancelCandidate, { once: true });
    if (input.signal?.aborted) candidateAbort.abort();
    try {
      if (index > 0) {
        input.onTryingAlternate?.();
        try {
          const discovery = await boundedRouteProbe((signal) => discover(route, signal), candidateAbort);
          if (!current() || input.signal?.aborted) return { status: "stale" };
          if (discovery.serverId.toLowerCase() !== connection.serverId.toLowerCase()) {
            mismatchedCandidates += 1;
            continue;
          }
        } catch (error) {
          if (!current() || input.signal?.aborted || isAbortError(error)) return { status: "stale" };
          continue;
        }
      }

      try {
        const candidate = route === connection.serverBaseUrl ? connection : { ...connection, serverBaseUrl: route };
        const { currentUser, serverInfo } = await boundedRouteProbe((signal) => loadContext(createClient(candidate), signal), candidateAbort);
        if (!current() || input.signal?.aborted) return { status: "stale" };
        if (serverInfo.serverId.toLowerCase() !== connection.serverId.toLowerCase()) {
          if (index === 0) return { status: "identity-mismatch" };
          mismatchedCandidates += 1;
          continue;
        }
        if (currentUser.profileId !== connection.verifiedUser.profileId) {
          if (index === 0) return { status: "profile-mismatch" };
          mismatchedCandidates += 1;
          continue;
        }
        const updated = applyAuthenticatedContextToConnection(
          candidate, currentUser, serverInfo, (input.now ?? (() => new Date().toISOString()))(),
          { markVerified: input.markVerified },
        );
        const routeChanged = index > 0;
        const connectionChanged = routeChanged || hasCurrentAccountChanged(connection, updated);
        const published = publishActiveConnectionResult(publication, () => {
          if (connectionChanged) {
            (input.save ?? saveActiveConnection)(updated);
            input.onConnectionChanged?.();
          }
        });
        candidateSucceeded = published;
        return published
          ? { status: "verified", currentUser, routeChanged, connectionChanged }
          : { status: "stale" };
      } catch (error) {
        if (!current() || input.signal?.aborted || isAbortError(error)) return { status: "stale" };
        if (error instanceof ServerIdentityMismatchError) {
          if (index === 0) return { status: "identity-mismatch" };
          mismatchedCandidates += 1;
          continue;
        }
        if (isAuthorizationError(error)) {
          return { status: "authorization-failed", error, authenticationRejected: isAuthenticationRepairError(error) };
        }
        if (index === 0) {
          if (!isRouteTransportFailure(error)) return { status: "failed", error };
          if (routes.length === 1) return { status: "unavailable", mismatchedCandidates };
        }
      }
    } finally {
      if (!candidateSucceeded) candidateAbort.abort();
      input.signal?.removeEventListener("abort", cancelCandidate);
    }
  }
  if (!current() || input.signal?.aborted) return { status: "stale" };
  debugWarn("reader", "[SPR connection] no saved route could verify the Library", {
    serverId: connection.serverId,
    currentRoute: connection.serverBaseUrl,
    attemptedRoutes: routes.length,
    mismatchedCandidates,
  });
  return { status: "unavailable", mismatchedCandidates };
}

async function boundedRouteProbe<T>(start: (signal: AbortSignal) => Promise<T>, controller: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  let timedOut = false;
  const timeoutError = new RouteProbeTimeoutError("Library route did not respond in time.");
  try {
    if (controller.signal.aborted) throw new DOMException("Route recovery cancelled.", "AbortError");
    return await Promise.race([
      start(controller.signal),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(timeoutError);
        }, ROUTE_PROBE_TIMEOUT_MS);
      }),
      new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(new DOMException("Route recovery cancelled.", "AbortError"));
        if (controller.signal.aborted) onAbort();
        else controller.signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } catch (error) {
    if (timedOut) throw timeoutError;
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (onAbort) controller.signal.removeEventListener("abort", onAbort);
  }
}
