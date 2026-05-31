import type {
  ClientApiLoginRequestResponse,
  ClientApiPollResponse,
  MePayload,
  SecondPassDiscovery,
} from "./schemas/clientApiAuth";
import { requestJson, requestJsonUrl, resolveUrl } from "./apiHttp";
import type { AuthenticatedClientContext } from "./clientContext";

export async function discoverSecondPass(serverBaseUrl: string): Promise<SecondPassDiscovery> {
  const url = resolveUrl(serverBaseUrl, "/.well-known/secondpass");
  return requestJsonUrl<SecondPassDiscovery>({ url, method: "GET" });
}

export async function createLoginRequest(
  discovery: SecondPassDiscovery,
  input?: { clientName?: string; clientType?: string },
  defaultAccessToken?: string | null,
): Promise<ClientApiLoginRequestResponse> {
  const url = resolveUrl(discovery.api_base_url, discovery.client_api.login_request_endpoint);
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

export async function getMe(ctx: AuthenticatedClientContext): Promise<MePayload> {
  return requestJson<MePayload>({
    apiBaseUrl: ctx.apiBaseUrl,
    accessToken: ctx.accessToken,
    tokenType: ctx.tokenType,
    endpointOrUrl: "/accounts/me/",
    options: {
      errorMessages: {
        401: "Token is invalid or revoked (401).",
        403: "Token is not allowed for /me (403).",
      },
    },
  });
}
