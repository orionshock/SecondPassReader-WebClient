import type { SecondPassDiscovery } from "@secondpass/client";

// Public discovery supplies persisted display and linking metadata for the current route.
export function toConnectionDiscoveryMetadata(discovery: SecondPassDiscovery) {
  return {
    serverId: discovery.serverId,
    serverName: discovery.server_name,
    serverDescription: discovery.server_description,
    serverVersion: discovery.server_version,
    serverReleaseDate: discovery.server_release_date,
    clientApi: {
      discoveryVersion: discovery.client_api.discovery_version,
      loginRequestEndpoint: discovery.client_api.login_request_endpoint,
      pollEndpointTemplate: discovery.client_api.poll_endpoint_template,
      consumeEndpointTemplate: discovery.client_api.consume_endpoint_template,
      tokenType: discovery.client_api.token_type,
    },
  };
}
