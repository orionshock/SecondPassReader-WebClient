import type { ActiveConnection } from "../../storage/ActiveConnection.Store";
import { buildOfflineCacheNamespace } from "../../app/offline/namespace/OfflineCacheNamespace.Policy";
import { removeOfflineNamespace } from "../../app/offline/namespace/OfflineNamespaceCleanup.Actions";

export type FinalizeConnectionRepairResult =
  | { status: "saved"; identity: "same" | "different" }
  | { status: "failed" };

export async function finalizeConnectionRepair(input: {
  previous: ActiveConnection;
  verified: ActiveConnection;
  save(connection: ActiveConnection): void;
  removeNamespace?: typeof removeOfflineNamespace;
}): Promise<FinalizeConnectionRepairResult> {
  const previousNamespace = namespaceKey(input.previous);
  const verifiedNamespace = namespaceKey(input.verified);
  if (!verifiedNamespace) return { status: "failed" };

  const identity = previousNamespace === verifiedNamespace ? "same" : "different";
  if (previousNamespace && identity === "different") {
    // Remove the old identity before activating the new one; this client retains no dormant user namespace.
    const removed = await (input.removeNamespace ?? removeOfflineNamespace)(previousNamespace);
    if (removed.status !== "removed") return { status: "failed" };
  }

  input.save(input.verified);
  return { status: "saved", identity };
}

function namespaceKey(connection: ActiveConnection): string | null {
  if (!connection.verifiedAt || !connection.verifiedUser?.profileId) return null;
  return buildOfflineCacheNamespace({
    serverId: connection.serverId,
    profileId: connection.verifiedUser.profileId,
  })?.key ?? null;
}
