import type {
  ClientApiLoginRequestResponse,
  ClientApiPollResponse,
  MePayload,
  SecondPassDiscovery,
} from "../schemas/clientApiAuth";
import { ApiError, requestJsonUrl, resolveUrl } from "./apiHttp";

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

export async function getMe(input: { apiBaseUrl: string; accessToken: string; tokenType?: string }): Promise<MePayload> {
  const url = resolveUrl(input.apiBaseUrl, "/accounts/me/");
  const tokenType = input.tokenType ?? "Bearer";

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `${tokenType} ${input.accessToken}`,
    },
  });

  if (res.status === 401) {
    throw new ApiError({ kind: "unauthorized", status: 401, message: "Token is invalid or revoked (401)." });
  }
  if (res.status === 403) {
    throw new ApiError({ kind: "forbidden", status: 403, message: "Token is not allowed for /me (403)." });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError({
      kind: "http_error",
      status: res.status,
      message: `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
    });
  }

  return (await res.json()) as MePayload;
}
