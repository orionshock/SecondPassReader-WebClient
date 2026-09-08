export type OfflineCacheIdentityInput = {
  serverBaseUrl?: string | null;
  accountProfileId?: string | null;
};

export type OfflineCacheNamespace = {
  serverOrigin: string;
  accountProfileId: string;
  key: string;
};

export function buildOfflineCacheNamespace(
  input: OfflineCacheIdentityInput,
): OfflineCacheNamespace | null {
  const serverOrigin = normalizeServerOrigin(input.serverBaseUrl);
  const accountProfileId = input.accountProfileId?.trim();
  if (!serverOrigin || !accountProfileId) return null;

  return {
    serverOrigin,
    accountProfileId,
    key: `server:${encodeURIComponent(serverOrigin)}|profile:${encodeURIComponent(accountProfileId)}`,
  };
}

function normalizeServerOrigin(serverBaseUrl: string | null | undefined): string | null {
  const value = serverBaseUrl?.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}
