import type {
  ClientApiLoginRequestResponse,
  ClientApiPollResponse,
  MePayload,
  SecondPassDiscovery,
} from "../schemas/clientApiAuth";
import type { BookFileDownloadResult, LibraryBook, PaginatedResponse } from "../schemas/library";
import type {
  ReadingAnnotationCreatePayload,
  ReadingAnnotationPage,
  ReadingAnnotation,
  ReadingAnnotationUpdatePayload,
  ReadingOpenResponse,
  ReadingProgress,
  ReadingProgressUpdatePayload,
  ReadingSession,
} from "../schemas/readingSession";

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

  async createLoginRequest(
    discovery: SecondPassDiscovery,
    input?: { clientName?: string; clientType?: string },
  ): Promise<ClientApiLoginRequestResponse> {
    const url = resolveUrl(discovery.api_base_url, discovery.client_api.login_request_endpoint);
    return this.requestJsonUrl<ClientApiLoginRequestResponse>({
      url,
      method: "POST",
      body: {
        client_name: input?.clientName ?? "Second Pass Reader",
        client_type: input?.clientType ?? "reader",
      },
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
      series?: string | number;
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
    if (params.series !== undefined) url.searchParams.set("series", String(params.series));
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

  async getBook(input: {
    apiBaseUrl: string;
    accessToken: string;
    tokenType?: string;
    bookId: string;
  }): Promise<LibraryBook> {
    const tokenType = input.tokenType ?? "Bearer";
    const url = resolveUrl(input.apiBaseUrl, `/library/books/${encodeURIComponent(input.bookId)}/`);

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
      throw new ApiError({ kind: "forbidden", status: 403, message: "Token is not allowed to access the library (403)." });
    }
    if (res.status === 404) {
      throw new ApiError({ kind: "http_error", status: 404, message: "Book not found or not accessible (404)." });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ApiError({
        kind: "http_error",
        status: res.status,
        message: `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
      });
    }

    return (await res.json()) as LibraryBook;
  }

  async closeReadingSession(input: {
    apiBaseUrl: string;
    accessToken: string;
    tokenType?: string;
    sessionId: string;
  }): Promise<ReadingSession> {
    const tokenType = input.tokenType ?? "Bearer";
    const url = resolveUrl(input.apiBaseUrl, `/reading/sessions/${encodeURIComponent(input.sessionId)}/close/`);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `${tokenType} ${input.accessToken}`,
      },
    });

    if (res.status === 401) {
      throw new ApiError({ kind: "unauthorized", status: 401, message: "Token is invalid or revoked (401)." });
    }
    if (res.status === 403) {
      throw new ApiError({
        kind: "forbidden",
        status: 403,
        message: "Token is not allowed to modify reading data (403).",
      });
    }
    if (res.status === 404) {
      throw new ApiError({ kind: "http_error", status: 404, message: "Reading session not found or not accessible (404)." });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ApiError({
        kind: "http_error",
        status: res.status,
        message: `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
      });
    }

    return (await res.json()) as ReadingSession;
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

  async openReadingSession(input: {
    apiBaseUrl: string;
    accessToken: string;
    tokenType?: string;
    bookId: string | number;
  }): Promise<ReadingOpenResponse> {
    const tokenType = input.tokenType ?? "Bearer";
    const url = resolveUrl(input.apiBaseUrl, `/reading/books/${encodeURIComponent(String(input.bookId))}/open/`);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `${tokenType} ${input.accessToken}`,
      },
      body: JSON.stringify({}),
    });

    if (res.status === 401) {
      throw new ApiError({ kind: "unauthorized", status: 401, message: "Token is invalid or revoked (401)." });
    }
    if (res.status === 403) {
      throw new ApiError({
        kind: "forbidden",
        status: 403,
        message: "Token is not allowed to access reading data (403).",
      });
    }
    if (res.status === 404) {
      throw new ApiError({ kind: "http_error", status: 404, message: "Book not found or not accessible (404)." });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ApiError({
        kind: "http_error",
        status: res.status,
        message: `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
      });
    }

    return (await res.json()) as ReadingOpenResponse;
  }

  async startOverReadingSession(input: {
    apiBaseUrl: string;
    accessToken: string;
    tokenType?: string;
    bookId: string | number;
  }): Promise<ReadingOpenResponse> {
    const tokenType = input.tokenType ?? "Bearer";
    const url = resolveUrl(input.apiBaseUrl, `/reading/books/${encodeURIComponent(String(input.bookId))}/start-over/`);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `${tokenType} ${input.accessToken}`,
      },
    });

    if (res.status === 401) {
      throw new ApiError({ kind: "unauthorized", status: 401, message: "Token is invalid or revoked (401)." });
    }
    if (res.status === 403) {
      throw new ApiError({
        kind: "forbidden",
        status: 403,
        message: "Token is not allowed to start over reading sessions (403).",
      });
    }
    if (res.status === 404) {
      throw new ApiError({ kind: "http_error", status: 404, message: "Book not found or not accessible (404)." });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ApiError({
        kind: "http_error",
        status: res.status,
        message: `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
      });
    }

    return (await res.json()) as ReadingOpenResponse;
  }

  async updateReadingProgress(input: {
    apiBaseUrl: string;
    accessToken: string;
    tokenType?: string;
    sessionId: string;
    payload: ReadingProgressUpdatePayload;
    method?: "PUT" | "PATCH";
  }): Promise<ReadingProgress> {
    const tokenType = input.tokenType ?? "Bearer";
    const url = resolveUrl(input.apiBaseUrl, `/reading/sessions/${encodeURIComponent(input.sessionId)}/progress/`);

    const res = await fetch(url, {
      method: input.method ?? "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `${tokenType} ${input.accessToken}`,
      },
      body: JSON.stringify(input.payload),
    });

    if (res.status === 401) {
      throw new ApiError({ kind: "unauthorized", status: 401, message: "Token is invalid or revoked (401)." });
    }
    if (res.status === 403) {
      throw new ApiError({ kind: "forbidden", status: 403, message: "Token cannot update reading progress (403)." });
    }
    if (res.status === 404) {
      throw new ApiError({ kind: "http_error", status: 404, message: "Reading session not found (404)." });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ApiError({
        kind: "http_error",
        status: res.status,
        message: `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
      });
    }

    return (await res.json()) as ReadingProgress;
  }

  async listReadingAnnotations(input: {
    apiBaseUrl: string;
    accessToken: string;
    tokenType?: string;
    sessionId: string;
    page?: number;
  }): Promise<ReadingAnnotationPage> {
    const tokenType = input.tokenType ?? "Bearer";
    const url = new URL(resolveUrl(input.apiBaseUrl, "/reading/annotations/"));
    url.searchParams.set("session_id", input.sessionId);
    if (input.page !== undefined) url.searchParams.set("page", String(input.page));

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
      throw new ApiError({ kind: "forbidden", status: 403, message: "Token cannot list reading annotations (403)." });
    }
    if (res.status === 404) {
      throw new ApiError({ kind: "http_error", status: 404, message: "Reading annotations endpoint not found (404)." });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ApiError({
        kind: "http_error",
        status: res.status,
        message: `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
      });
    }

    return (await res.json()) as ReadingAnnotationPage;
  }

  async createReadingAnnotation(input: {
    apiBaseUrl: string;
    accessToken: string;
    tokenType?: string;
    payload: ReadingAnnotationCreatePayload;
    idempotencyKey?: string;
  }): Promise<ReadingAnnotation> {
    const tokenType = input.tokenType ?? "Bearer";
    const url = resolveUrl(input.apiBaseUrl, "/reading/annotations/");

    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `${tokenType} ${input.accessToken}`,
    };
    if (input.idempotencyKey) headers["Idempotency-Key"] = input.idempotencyKey;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(input.payload),
    });

    if (res.status === 401) {
      throw new ApiError({ kind: "unauthorized", status: 401, message: "Token is invalid or revoked (401)." });
    }
    if (res.status === 403) {
      throw new ApiError({ kind: "forbidden", status: 403, message: "Token cannot create reading annotations (403)." });
    }
    if (res.status === 400) {
      const text = await res.text().catch(() => "");
      throw new ApiError({
        kind: "http_error",
        status: 400,
        message: `Validation error (400)${text ? ` - ${text}` : ""}`,
      });
    }
    if (res.status === 409) {
      const text = await res.text().catch(() => "");
      throw new ApiError({
        kind: "http_error",
        status: 409,
        message: `Idempotency key was already used for a different request (409)${text ? ` - ${text}` : ""}`,
      });
    }
    if (res.status === 404) {
      throw new ApiError({ kind: "http_error", status: 404, message: "Reading annotations endpoint not found (404)." });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ApiError({
        kind: "http_error",
        status: res.status,
        message: `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
      });
    }

    return (await res.json()) as ReadingAnnotation;
  }

  async updateReadingAnnotation(input: {
    apiBaseUrl: string;
    accessToken: string;
    tokenType?: string;
    annotationId: string;
    payload: ReadingAnnotationUpdatePayload;
  }): Promise<ReadingAnnotation> {
    const tokenType = input.tokenType ?? "Bearer";
    const url = resolveUrl(input.apiBaseUrl, `/reading/annotations/${encodeURIComponent(input.annotationId)}/`);

    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `${tokenType} ${input.accessToken}`,
      },
      body: JSON.stringify(input.payload),
    });

    if (res.status === 401) {
      throw new ApiError({ kind: "unauthorized", status: 401, message: "Token is invalid or revoked (401)." });
    }
    if (res.status === 403) {
      throw new ApiError({ kind: "forbidden", status: 403, message: "Token cannot update reading annotations (403)." });
    }
    if (res.status === 400) {
      const text = await res.text().catch(() => "");
      throw new ApiError({
        kind: "http_error",
        status: 400,
        message: `Validation error (400)${text ? ` - ${text}` : ""}`,
      });
    }
    if (res.status === 404) {
      throw new ApiError({ kind: "http_error", status: 404, message: "Reading annotation not found (404)." });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ApiError({
        kind: "http_error",
        status: res.status,
        message: `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
      });
    }

    return (await res.json()) as ReadingAnnotation;
  }

  async deleteReadingAnnotation(input: {
    apiBaseUrl: string;
    accessToken: string;
    tokenType?: string;
    annotationId: string;
  }): Promise<void> {
    const tokenType = input.tokenType ?? "Bearer";
    const url = resolveUrl(input.apiBaseUrl, `/reading/annotations/${encodeURIComponent(input.annotationId)}/`);

    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: `${tokenType} ${input.accessToken}`,
      },
    });

    if (res.status === 401) {
      throw new ApiError({ kind: "unauthorized", status: 401, message: "Token is invalid or revoked (401)." });
    }
    if (res.status === 403) {
      throw new ApiError({ kind: "forbidden", status: 403, message: "Token cannot delete reading annotations (403)." });
    }
    if (res.status === 404) {
      throw new ApiError({ kind: "http_error", status: 404, message: "Reading annotation not found (404)." });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ApiError({
        kind: "http_error",
        status: res.status,
        message: `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
      });
    }
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
