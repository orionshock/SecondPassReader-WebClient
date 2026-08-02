import type {
  ClientApiLoginRequestResponse,
  ClientApiPollResponse,
  SecondPassDiscovery,
} from "./schemas/clientApiAuth";
import { requestJsonUrl, resolveUrl } from "./apiHttp";

const CLIENT_API_LOGIN_REQUEST_ENDPOINT = "/client-api/login-requests/";

export async function discoverSecondPass(serverBaseUrl: string): Promise<SecondPassDiscovery> {
  const url = resolveUrl(serverBaseUrl, "/.well-known/secondpass");
  return requestJsonUrl<SecondPassDiscovery>({ url, method: "GET" });
}

export async function createLoginRequest(
  discovery: SecondPassDiscovery,
  input?: { clientName?: string; clientType?: string },
  defaultAccessToken?: string | null,
): Promise<ClientApiLoginRequestResponse> {
  const url = resolveUrl(discovery.api_base_url, discovery.client_api?.login_request_endpoint ?? CLIENT_API_LOGIN_REQUEST_ENDPOINT);
  return requestJsonUrl<ClientApiLoginRequestResponse>({
    url,
    method: "POST",
    body: {
      client_name: input?.clientName ?? "Second Pass Reader",
      client_type: input?.clientType ?? "reader",
    },
    defaultAccessToken,
  });
}

export async function pollLoginRequest(pollUrl: string, defaultAccessToken?: string | null): Promise<ClientApiPollResponse> {
  return requestJsonUrl<ClientApiPollResponse>({ url: pollUrl, method: "GET", defaultAccessToken });
}
