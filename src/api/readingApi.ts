import type {
  ReadingAnnotation,
  ReadingAnnotationCreatePayload,
  ReadingAnnotationPage,
  ReadingAnnotationUpdatePayload,
  ReadingOpenResponse,
  ReadingProgress,
  ReadingProgressUpdatePayload,
  ReadingRecentSessionsResponse,
  ReadingSessionSummary,
  ReadingSession,
} from "../schemas/readingSession";
import type { PaginatedResponse } from "../schemas/library";
import { ApiError, resolveUrl } from "./apiHttp";

export async function listRecentReadingSessions(input: {
  apiBaseUrl: string;
  accessToken: string;
  tokenType?: string;
  limit?: number;
}): Promise<ReadingRecentSessionsResponse> {
  const tokenType = input.tokenType ?? "Bearer";
  const url = new URL(resolveUrl(input.apiBaseUrl, "/reading/sessions/recent/"));
  if (typeof input.limit === "number") url.searchParams.set("limit", String(input.limit));

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
    throw new ApiError({
      kind: "forbidden",
      status: 403,
      message: "Token is not allowed to access reading sessions (403).",
    });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError({
      kind: "http_error",
      status: res.status,
      message: `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
    });
  }

  return (await res.json()) as ReadingRecentSessionsResponse;
}

export async function closeReadingSession(input: {
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

export async function openReadingSession(input: {
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

export async function startOverReadingSession(input: {
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

export async function updateReadingProgress(input: {
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

export async function listReadingAnnotations(input: {
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

export async function listReadingSessions(input: {
  apiBaseUrl: string;
  accessToken: string;
  tokenType?: string;
  page?: number;
  pageSize?: number;
  bookId?: string | number;
  status?: "active" | "completed" | "archived" | string;
  isActive?: boolean;
}): Promise<PaginatedResponse<ReadingSessionSummary>> {
  const tokenType = input.tokenType ?? "Bearer";
  const url = new URL(resolveUrl(input.apiBaseUrl, "/reading/sessions/"));
  if (input.page !== undefined) url.searchParams.set("page", String(input.page));
  if (input.pageSize !== undefined) url.searchParams.set("page_size", String(input.pageSize));
  if (input.bookId !== undefined) url.searchParams.set("book", String(input.bookId));
  if (input.status) url.searchParams.set("status", String(input.status));
  if (input.isActive !== undefined) url.searchParams.set("is_active", input.isActive ? "true" : "false");

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
    throw new ApiError({ kind: "forbidden", status: 403, message: "Token is not allowed to access reading sessions (403)." });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError({
      kind: "http_error",
      status: res.status,
      message: `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
    });
  }

  return (await res.json()) as PaginatedResponse<ReadingSessionSummary>;
}

export async function getReadingSession(input: {
  apiBaseUrl: string;
  accessToken: string;
  tokenType?: string;
  sessionId: string;
}): Promise<ReadingSessionSummary> {
  const tokenType = input.tokenType ?? "Bearer";
  const url = resolveUrl(input.apiBaseUrl, `/reading/sessions/${encodeURIComponent(input.sessionId)}/`);

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
    throw new ApiError({ kind: "forbidden", status: 403, message: "Token is not allowed to access reading sessions (403)." });
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

  return (await res.json()) as ReadingSessionSummary;
}

export async function updateReadingSession(input: {
  apiBaseUrl: string;
  accessToken: string;
  tokenType?: string;
  sessionId: string;
  payload: { name?: string; notes?: string };
}): Promise<ReadingSessionSummary> {
  const tokenType = input.tokenType ?? "Bearer";
  const url = resolveUrl(input.apiBaseUrl, `/reading/sessions/${encodeURIComponent(input.sessionId)}/`);

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
    throw new ApiError({ kind: "forbidden", status: 403, message: "Token is not allowed to modify reading sessions (403)." });
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

  return (await res.json()) as ReadingSessionSummary;
}

export async function createReadingAnnotation(input: {
  apiBaseUrl: string;
  accessToken: string;
  tokenType?: string;
  payload: ReadingAnnotationCreatePayload;
  idempotencyKey?: string;
}): Promise<ReadingAnnotation> {
  const tokenType = input.tokenType ?? "Bearer";
  const url = resolveUrl(input.apiBaseUrl, "/reading/annotations/");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `${tokenType} ${input.accessToken}`,
      ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
    },
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

export async function updateReadingAnnotation(input: {
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

export async function deleteReadingAnnotation(input: {
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
