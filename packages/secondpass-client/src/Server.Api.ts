import { authErrorMessages, requestJson } from "./ApiHttp.Adapter";
import type { AuthenticatedClientContext } from "./ClientContext.Policy";
import type { ServerInfo } from "./schemas/Server.Types";
import { isServerId } from "./ServerIdentity.Policy";
import { isLibraryBaseUrl } from "./ServerRoute.Policy";

type ServerInfoWire = {
  server_id?: unknown;
  server_urls?: unknown;
  server_name?: string;
  server_description?: string;
  server_banner_message?: string;
  advanced_library_groups_enabled?: boolean;
  reading_client_base_url?: string;
  marginalia_profile_uri?: string;
  public_group?: {
    id?: string;
    name?: string;
    description?: string;
  };
  server_version?: string;
  server_release_date?: string;
};

export async function getServerInfo(ctx: AuthenticatedClientContext, options?: { signal?: AbortSignal }): Promise<ServerInfo> {
  const wire = await requestJson<ServerInfoWire>({
    apiRootUrl: ctx.apiRootUrl,
    accessToken: ctx.accessToken,
    tokenType: ctx.tokenType,
    endpointOrUrl: "/server/info/",
    options: {
      signal: options?.signal,
      errorMessages: authErrorMessages({ forbidden: "Token is not allowed for /server/info (403)." }),
    },
  });

  if (!isServerId(wire.server_id) || !Array.isArray(wire.server_urls)
    || !wire.server_urls.every(isLibraryBaseUrl)) {
    throw new Error("Invalid authenticated server information.");
  }

  return {
    serverId: wire.server_id,
    serverUrls: wire.server_urls,
    name: wire.server_name ?? "",
    description: wire.server_description ?? "",
    bannerText: wire.server_banner_message ?? "",
    advancedLibraryGroupsEnabled: wire.advanced_library_groups_enabled === true,
    readingClientBaseUrl: wire.reading_client_base_url ?? "",
    marginaliaProfileUri: wire.marginalia_profile_uri ?? "",
    publicGroup: {
      id: wire.public_group?.id ?? "",
      name: wire.public_group?.name ?? "",
      description: wire.public_group?.description ?? "",
    },
    version: wire.server_version ?? "",
    releaseDate: wire.server_release_date ?? "",
  };
}
