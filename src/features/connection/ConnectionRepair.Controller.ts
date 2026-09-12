import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";
import { buildOfflineCacheNamespace } from "../../app/offline/namespace/OfflineCacheNamespace.Policy";
import { removeOfflineNamespace } from "../../app/offline/namespace/OfflineNamespaceCleanup.Actions";

export type FinalizeConnectionRepairResult =
  | { status: "saved"; identity: "same" | "different" }
  | { status: "failed" };

export async function finalizeConnectionRepair(input: {
  previous: ConnectionProfile;
  verified: ConnectionProfile;
  save(profile: ConnectionProfile): void;
  removeNamespace?: typeof removeOfflineNamespace;
}): Promise<FinalizeConnectionRepairResult> {
  const previousNamespace = namespaceKey(input.previous);
  const verifiedNamespace = namespaceKey(input.verified);
  if (!verifiedNamespace) return { status: "failed" };

  const identity = previousNamespace === verifiedNamespace ? "same" : "different";
  if (previousNamespace && identity === "different") {
    const removed = await (input.removeNamespace ?? removeOfflineNamespace)(previousNamespace);
    if (removed.status !== "removed") return { status: "failed" };
  }

  input.save(input.verified);
  return { status: "saved", identity };
}

function namespaceKey(profile: ConnectionProfile): string | null {
  if (!profile.verifiedAt || !profile.verifiedUser?.profileId) return null;
  return buildOfflineCacheNamespace({
    serverBaseUrl: profile.serverBaseUrl,
    accountProfileId: profile.verifiedUser.profileId,
  })?.key ?? null;
}
