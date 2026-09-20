export type AnonymousJsonUrlOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  credentials?: RequestCredentials;
  url: string;
  signal?: AbortSignal;
  /** Status-specific user messages that do not change response classification. */
  errorMessages?: Partial<Record<number, string>>;
};

export type ApiErrorKind = "unauthorized" | "forbidden" | "http_error";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly statusText: string;

  constructor(input: { kind: ApiErrorKind; status: number; statusText?: string; message: string }) {
    super(input.message);
    this.kind = input.kind;
    this.status = input.status;
    this.statusText = input.statusText ?? "";
  }
}

export class ApiTransportError extends Error {
  override readonly cause: unknown;

  constructor(cause: unknown) {
    super("Could not reach Second Pass Library.");
    this.name = "ApiTransportError";
    this.cause = cause;
  }
}

function containsHtml(value: string): boolean {
  return /<!doctype\s+html\b|<html(?:\s|>)/i.test(value);
}

function createApiError(res: Response, responseBody: string, overrideMessage?: string): ApiError {
  const statusDescription = [res.status, res.statusText].filter(Boolean).join(" ");
  const conciseMessage = `Request failed: ${statusDescription}`;
  const contentType = res.headers.get("content-type") ?? "";
  const bodyIsHtml = /(?:text\/html|application\/xhtml\+xml)/i.test(contentType) || containsHtml(responseBody);
  const safeOverride = overrideMessage && !containsHtml(overrideMessage) ? overrideMessage : undefined;
  const message = safeOverride ?? `${conciseMessage}${responseBody && !bodyIsHtml ? ` - ${responseBody}` : ""}`;
  const kind: ApiErrorKind =
    res.status === 401 ? "unauthorized" : res.status === 403 ? "forbidden" : "http_error";
  return new ApiError({ kind, status: res.status, statusText: res.statusText, message });
}

/** Shared authentication messages; endpoint owners may refine 403/404 wording. */
export const INVALID_OR_REVOKED_TOKEN_401 = "Token is invalid or revoked (401).";

export function authErrorMessages(input?: {
  forbidden?: string;
  notFound?: string;
}): Partial<Record<number, string>> {
  return {
    401: INVALID_OR_REVOKED_TOKEN_401,
    ...(input?.forbidden ? { 403: input.forbidden } : {}),
    ...(input?.notFound ? { 404: input.notFound } : {}),
  };
}

export function resolveUrl(baseUrl: string, endpointOrUrl: string): string {
  if (/^https?:\/\//i.test(endpointOrUrl)) return endpointOrUrl;
  const base = baseUrl.replace(/\/+$/, "");
  const path = endpointOrUrl.startsWith("/") ? endpointOrUrl : `/${endpointOrUrl}`;
  return `${base}${path}`;
}

export async function requestAnonymousJsonUrl<T>(options: AnonymousJsonUrlOptions): Promise<T> {
  const headers = { Accept: "application/json" };
  const res = await executeRequest(options.url, prepareJsonRequest({
    method: options.method,
    headers,
    body: options.body,
    credentials: options.credentials,
    signal: options.signal,
  }), options.errorMessages);

  return (await res.json()) as T;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RequestOptions = {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  errorMessages?: Partial<Record<number, string>>;
  signal?: AbortSignal;
};

function buildAuthHeaders(input: { accessToken: string; tokenType: string }): Record<string, string> {
  return { Authorization: `${input.tokenType} ${input.accessToken}` };
}

export async function requestJson<T>(input: {
  apiRootUrl: string;
  accessToken: string;
  tokenType: string;
  endpointOrUrl: string;
  options?: RequestOptions;
}): Promise<T> {
  const res = await request(input);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function requestVoid(input: {
  apiRootUrl: string;
  accessToken: string;
  tokenType: string;
  endpointOrUrl: string;
  options?: Omit<RequestOptions, "body">;
}): Promise<void> {
  await request(input);
}

async function request(input: {
  apiRootUrl: string;
  accessToken: string;
  tokenType: string;
  endpointOrUrl: string;
  options?: RequestOptions;
}): Promise<Response> {
  const url = resolveUrl(input.apiRootUrl, input.endpointOrUrl);
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...withoutAuthorization(input.options?.headers),
    ...buildAuthHeaders({ accessToken: input.accessToken, tokenType: input.tokenType }),
  };

  return executeRequest(url, prepareJsonRequest({
    method: input.options?.method,
    headers,
    body: input.options?.body,
    signal: input.options?.signal,
  }), input.options?.errorMessages);
}

export async function requestAuthenticatedBlob(input: {
  apiRootUrl: string;
  accessToken: string;
  tokenType: string;
  endpointOrUrl: string;
  options?: Omit<RequestOptions, "body"> & { accept?: string };
}): Promise<{ blob: Blob; response: Response }> {
  const url = resolveUrl(input.apiRootUrl, input.endpointOrUrl);
  const headers: Record<string, string> = {
    Accept: input.options?.accept ?? "application/octet-stream, */*",
    ...withoutAuthorization(input.options?.headers),
    ...buildAuthHeaders({ accessToken: input.accessToken, tokenType: input.tokenType }),
  };

  return requestBlobResponse(url, {
    method: input.options?.method ?? "GET",
    headers,
  }, input.options?.errorMessages);
}

export async function requestPublicBlob(input: {
  url: string;
  accept?: string;
}): Promise<{ blob: Blob; response: Response }> {
  return requestBlobResponse(input.url, {
    method: "GET",
    headers: { Accept: input.accept ?? "application/octet-stream, */*" },
  });
}

async function requestBlobResponse(
  url: string,
  init: RequestInit,
  errorMessages?: Partial<Record<number, string>>,
): Promise<{ blob: Blob; response: Response }> {
  const res = await executeRequest(url, init, errorMessages);

  const blob = await res.blob();
  return { blob, response: res };
}

function withoutAuthorization(headers?: Record<string, string>): Record<string, string> {
  if (!headers) return {};
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => name.toLowerCase() !== "authorization"),
  );
}

function prepareJsonRequest(input: {
  method?: HttpMethod;
  headers: Record<string, string>;
  body?: unknown;
  credentials?: RequestCredentials;
  signal?: AbortSignal;
}): RequestInit {
  let body: BodyInit | undefined;
  if (input.body !== undefined) {
    input.headers["Content-Type"] = "application/json";
    body = JSON.stringify(input.body);
  }
  return {
    method: input.method ?? "GET",
    headers: input.headers,
    body,
    credentials: input.credentials,
    signal: input.signal,
  };
}

async function executeRequest(
  url: string,
  init: RequestInit,
  errorMessages?: Partial<Record<number, string>>,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (init.signal?.aborted) throw new DOMException("Request aborted.", "AbortError");
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiTransportError(error);
  }
  if (response.ok) return response;

  const responseBody = await response.text().catch(() => "");
  throw createApiError(response, responseBody, errorMessages?.[response.status]);
}

export function tryParseFilename(contentDisposition: string): string | undefined {
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
