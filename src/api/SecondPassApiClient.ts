type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  accessToken?: string | null;
  body?: unknown;
  headers?: Record<string, string>;
};

type RequestUrlOptions = Omit<RequestOptions, "path"> & { url: string };

export type ApiMe = {
  id: string;
  email?: string | null;
  displayName?: string | null;
};

import type {
  ClientApiLoginRequestResponse,
  ClientApiPollResponse,
  SecondPassDiscovery,
} from "../schemas/clientApiAuth";

export class SecondPassApiClient {
  readonly serverBaseUrl: string;
  accessToken?: string | null;

  constructor(input: { serverBaseUrl: string; accessToken?: string | null }) {
    this.serverBaseUrl = input.serverBaseUrl.replace(/\/+$/, "");
    this.accessToken = input.accessToken ?? null;
  }

  private async requestJson<T>(options: RequestOptions): Promise<T> {
    const url = `${this.serverBaseUrl}${options.path.startsWith("/") ? "" : "/"}${options.path}`;
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

    const res = await fetch(url, {
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

  async getMe(): Promise<ApiMe> {
    return this.requestJson<ApiMe>({ path: "/api/v1/accounts/me/" });
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
}

function resolveUrl(baseUrl: string, endpointOrUrl: string): string {
  if (/^https?:\/\//i.test(endpointOrUrl)) return endpointOrUrl;
  const base = baseUrl.replace(/\/+$/, "");
  const path = endpointOrUrl.startsWith("/") ? endpointOrUrl : `/${endpointOrUrl}`;
  return `${base}${path}`;
}
