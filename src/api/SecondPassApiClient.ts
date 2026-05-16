import type {
  ClientApiLoginRequestResponse,
  ClientApiPollResponse,
  MePayload,
  SecondPassDiscovery,
} from "../schemas/clientApiAuth";

type RequestUrlOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  accessToken?: string | null;
  body?: unknown;
  headers?: Record<string, string>;
  url: string;
};

export type ApiErrorKind = "unauthorized" | "forbidden" | "http_error";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;

  constructor(input: { kind: ApiErrorKind; status: number; message: string }) {
    super(input.message);
    this.kind = input.kind;
    this.status = input.status;
  }
}

export class SecondPassApiClient {
  readonly serverBaseUrl: string;
  accessToken?: string | null;

  constructor(input: { serverBaseUrl: string; accessToken?: string | null }) {
    this.serverBaseUrl = input.serverBaseUrl.replace(/\/+$/, "");
    this.accessToken = input.accessToken ?? null;
  }

  private async requestJsonUrl<T>(options: RequestUrlOptions): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...options.headers,
    };

    const token = options.accessToken ?? this.accessToken;
    if (token) headers.Authorization = `Bearer ${token}`;

    let body: BodyInit | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const res = await fetch(options.url, {
      method: options.method ?? "GET",
      headers,
      body,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
    }

    return (await res.json()) as T;
  }

  async createLoginRequest(discovery: SecondPassDiscovery): Promise<ClientApiLoginRequestResponse> {
    const url = resolveUrl(discovery.api_base_url, discovery.client_api.login_request_endpoint);
    return this.requestJsonUrl<ClientApiLoginRequestResponse>({
      url,
      method: "POST",
      body: { client_name: "Second Pass Reader", client_type: "reader" },
    });
  }

  async pollLoginRequest(pollUrl: string): Promise<ClientApiPollResponse> {
    return this.requestJsonUrl<ClientApiPollResponse>({ url: pollUrl, method: "GET" });
  }

  async getMe(input: { apiBaseUrl: string; accessToken: string; tokenType?: string }): Promise<MePayload> {
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
}

function resolveUrl(baseUrl: string, endpointOrUrl: string): string {
  if (/^https?:\/\//i.test(endpointOrUrl)) return endpointOrUrl;
  const base = baseUrl.replace(/\/+$/, "");
  const path = endpointOrUrl.startsWith("/") ? endpointOrUrl : `/${endpointOrUrl}`;
  return `${base}${path}`;
}
