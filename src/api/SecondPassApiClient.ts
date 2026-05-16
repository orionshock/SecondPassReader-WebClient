type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  accessToken?: string | null;
  body?: unknown;
  headers?: Record<string, string>;
};

export type ApiMe = {
  id: string;
  email?: string | null;
  displayName?: string | null;
};

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

  async getMe(): Promise<ApiMe> {
    return this.requestJson<ApiMe>({ path: "/api/v1/accounts/me/" });
  }
}

