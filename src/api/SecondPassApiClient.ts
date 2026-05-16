import type {
  ClientApiLoginRequestResponse,
  ClientApiPollResponse,
  MePayload,
  SecondPassDiscovery,
} from "../schemas/clientApiAuth";
import type { BookFileDownloadResult, LibraryBook, PaginatedResponse } from "../schemas/library";

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

  async listBooks(input: {
    apiBaseUrl: string;
    accessToken: string;
    tokenType?: string;
    params?: {
      q?: string;
      hasFiles?: boolean;
      ordering?: string;
      page?: number;
      pageSize?: number;
    };
  }): Promise<PaginatedResponse<LibraryBook>> {
    const tokenType = input.tokenType ?? "Bearer";
    const url = new URL(resolveUrl(input.apiBaseUrl, "/library/books/"));
    const params = input.params ?? {};

    if (params.q) url.searchParams.set("q", params.q);
    if (params.hasFiles !== undefined) url.searchParams.set("has_files", params.hasFiles ? "true" : "false");
    if (params.ordering) url.searchParams.set("ordering", params.ordering);
    if (params.page !== undefined) url.searchParams.set("page", String(params.page));
    if (params.pageSize !== undefined) url.searchParams.set("page_size", String(params.pageSize));

    const res = await fetch(url.toString(), {
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
      throw new ApiError({ kind: "forbidden", status: 403, message: "Token is not allowed to access the library (403)." });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ApiError({
        kind: "http_error",
        status: res.status,
        message: `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
      });
    }

    return (await res.json()) as PaginatedResponse<LibraryBook>;
  }

  async downloadBookFile(input: {
    downloadUrl: string;
    accessToken: string;
    tokenType?: string;
  }): Promise<BookFileDownloadResult> {
    const tokenType = input.tokenType ?? "Bearer";
    const res = await fetch(input.downloadUrl, {
      method: "GET",
      headers: {
        Accept: "application/epub+zip, application/octet-stream, */*",
        Authorization: `${tokenType} ${input.accessToken}`,
      },
    });

    if (res.status === 401) {
      throw new ApiError({ kind: "unauthorized", status: 401, message: "Token is invalid or revoked (401)." });
    }
    if (res.status === 403) {
      throw new ApiError({ kind: "forbidden", status: 403, message: "Token is not allowed to download files (403)." });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ApiError({
        kind: "http_error",
        status: res.status,
        message: `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
      });
    }

    const contentType = res.headers.get("content-type") ?? undefined;
    const contentDisposition = res.headers.get("content-disposition") ?? undefined;
    const contentLengthRaw = res.headers.get("content-length");
    const contentLength = contentLengthRaw ? Number(contentLengthRaw) : undefined;

    const blob = await res.blob();
    const filename = contentDisposition ? tryParseFilename(contentDisposition) : undefined;

    return {
      blob,
      contentType,
      contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
      contentDisposition,
      filename,
    };
  }
}

function resolveUrl(baseUrl: string, endpointOrUrl: string): string {
  if (/^https?:\/\//i.test(endpointOrUrl)) return endpointOrUrl;
  const base = baseUrl.replace(/\/+$/, "");
  const path = endpointOrUrl.startsWith("/") ? endpointOrUrl : `/${endpointOrUrl}`;
  return `${base}${path}`;
}

function tryParseFilename(contentDisposition: string): string | undefined {
  // RFC 6266 basics: filename="<name>" or filename*=UTF-8''<urlencoded>
  const filenameStar = /filename\*\s*=\s*([^']*)''([^;]+)/i.exec(contentDisposition);
  if (filenameStar) {
    const encoded = filenameStar[2].trim();
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }

  const filename = /filename\s*=\s*\"?([^\";]+)\"?/i.exec(contentDisposition);
  if (filename) return filename[1].trim();
  return undefined;
}
