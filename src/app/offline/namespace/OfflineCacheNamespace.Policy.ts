import { isServerId } from "@secondpass/client";

export type OfflineCacheIdentityInput = {
  serverId?: string | null;
  profileId?: string | null;
};

export type OfflineCacheNamespace = {
  serverId: string;
  profileId: string;
  key: string;
};

export function buildOfflineCacheNamespace(
  input: OfflineCacheIdentityInput,
): OfflineCacheNamespace | null {
  const serverId = input.serverId?.trim().toLowerCase();
  const profileId = input.profileId?.trim();
  if (!isServerId(serverId) || !profileId) return null;

  return {
    serverId,
    profileId,
    key: `server:${serverId}|profile:${encodeURIComponent(profileId)}`,
  };
}
