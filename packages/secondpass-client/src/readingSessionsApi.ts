import type {
  ReadingBookActivitySummaryResponse,
  ReadingOpenResponse,
  ReadingRecentSessionsResponse,
  ReadingSession,
  ReadingSessionsListResponse,
  ReadingSessionSummary,
} from "./schemas/readingSession";
import type { AuthenticatedClientContext } from "./clientContext";
import { authErrorMessages, requestJson, resolveUrl } from "./apiHttp";

const READING_SESSIONS_FORBIDDEN_403 = "Token is not allowed to access reading sessions (403).";
const READING_DATA_FORBIDDEN_403 = "Token is not allowed to access reading data (403).";
const READING_MODIFY_FORBIDDEN_403 = "Token is not allowed to modify reading data (403).";
const READING_START_OVER_FORBIDDEN_403 = "Token is not allowed to start over reading sessions (403).";
const READING_SESSIONS_MODIFY_FORBIDDEN_403 = "Token is not allowed to modify reading sessions (403).";

export async function listRecentReadingSessions(
  ctx: AuthenticatedClientContext,
  input?: { limit?: number },
): Promise<ReadingRecentSessionsResponse> {
  const url = new URL(resolveUrl(ctx.apiBaseUrl, "/reading/sessions/recent/"));
  if (typeof input?.limit === "number") url.searchParams.set("limit", String(input.limit));

  return requestJson<ReadingRecentSessionsResponse>({
    apiBaseUrl: ctx.apiBaseUrl,
    accessToken: ctx.accessToken,
    tokenType: ctx.tokenType,
    endpointOrUrl: url.toString(),
    options: {
      errorMessages: authErrorMessages({ forbidden: READING_SESSIONS_FORBIDDEN_403 }),
    },
  });
}

export async function closeReadingSession(
  ctx: AuthenticatedClientContext,
  input: { sessionId: string },
): Promise<ReadingSession> {
  const url = resolveUrl(ctx.apiBaseUrl, `/reading/sessions/${encodeURIComponent(input.sessionId)}/close/`);

  return requestJson<ReadingSession>({
    apiBaseUrl: ctx.apiBaseUrl,
    accessToken: ctx.accessToken,
    tokenType: ctx.tokenType,
    endpointOrUrl: url,
    options: {
      method: "POST",
      errorMessages: authErrorMessages({
        forbidden: READING_MODIFY_FORBIDDEN_403,
        notFound: "Reading session not found or not accessible (404).",
      }),
    },
  });
}

export async function openReadingSession(
  ctx: AuthenticatedClientContext,
  input: { bookId: string | number },
): Promise<ReadingOpenResponse> {
  const url = resolveUrl(ctx.apiBaseUrl, `/reading/books/${encodeURIComponent(String(input.bookId))}/open/`);

  return requestJson<ReadingOpenResponse>({
    apiBaseUrl: ctx.apiBaseUrl,
    accessToken: ctx.accessToken,
    tokenType: ctx.tokenType,
    endpointOrUrl: url,
    options: {
      method: "POST",
      body: {},
      errorMessages: authErrorMessages({
        forbidden: READING_DATA_FORBIDDEN_403,
        notFound: "Book not found or not accessible (404).",
      }),
    },
  });
}

export async function startOverReadingSession(
  ctx: AuthenticatedClientContext,
  input: { bookId: string | number },
): Promise<ReadingOpenResponse> {
  const url = resolveUrl(ctx.apiBaseUrl, `/reading/books/${encodeURIComponent(String(input.bookId))}/start-over/`);

  return requestJson<ReadingOpenResponse>({
    apiBaseUrl: ctx.apiBaseUrl,
    accessToken: ctx.accessToken,
    tokenType: ctx.tokenType,
    endpointOrUrl: url,
    options: {
      method: "POST",
      errorMessages: authErrorMessages({
        forbidden: READING_START_OVER_FORBIDDEN_403,
        notFound: "Book not found or not accessible (404).",
      }),
    },
  });
}

export async function listReadingSessions(input: {
  ctx: AuthenticatedClientContext;
  page?: number;
  pageSize?: number;
  bookId?: string | number;
  status?: "active" | "completed" | "archived" | string;
  isActive?: boolean;
  q?: string;
}): Promise<ReadingSessionsListResponse> {
  const url = new URL(resolveUrl(input.ctx.apiBaseUrl, "/reading/sessions/"));
  if (input.page !== undefined) url.searchParams.set("page", String(input.page));
  if (input.pageSize !== undefined) url.searchParams.set("page_size", String(input.pageSize));
  if (input.bookId !== undefined) url.searchParams.set("book", String(input.bookId));
  if (input.status) url.searchParams.set("status", String(input.status));
  if (input.isActive !== undefined) url.searchParams.set("is_active", input.isActive ? "true" : "false");
  const q = typeof input.q === "string" ? input.q.trim() : "";
  if (q) url.searchParams.set("q", q);

  return requestJson<ReadingSessionsListResponse>({
    apiBaseUrl: input.ctx.apiBaseUrl,
    accessToken: input.ctx.accessToken,
    tokenType: input.ctx.tokenType,
    endpointOrUrl: url.toString(),
    options: {
      errorMessages: authErrorMessages({ forbidden: READING_SESSIONS_FORBIDDEN_403 }),
    },
  });
}

export async function getReadingBookActivitySummary(
  ctx: AuthenticatedClientContext,
  input: { books: Array<string | number> },
): Promise<ReadingBookActivitySummaryResponse> {
  const url = resolveUrl(ctx.apiBaseUrl, "/reading/books/activity-summary/");

  return requestJson<ReadingBookActivitySummaryResponse>({
    apiBaseUrl: ctx.apiBaseUrl,
    accessToken: ctx.accessToken,
    tokenType: ctx.tokenType,
    endpointOrUrl: url,
    options: {
      method: "POST",
      body: { books: input.books.map((book) => String(book)) },
      errorMessages: authErrorMessages({
        forbidden: READING_SESSIONS_FORBIDDEN_403,
        notFound: "Reading book activity summary endpoint not found (404).",
      }),
    },
  });
}

export async function getReadingSession(input: {
  ctx: AuthenticatedClientContext;
  sessionId: string;
}): Promise<ReadingSessionSummary> {
  const url = resolveUrl(input.ctx.apiBaseUrl, `/reading/sessions/${encodeURIComponent(input.sessionId)}/`);

  return requestJson<ReadingSessionSummary>({
    apiBaseUrl: input.ctx.apiBaseUrl,
    accessToken: input.ctx.accessToken,
    tokenType: input.ctx.tokenType,
    endpointOrUrl: url,
    options: {
      errorMessages: authErrorMessages({
        forbidden: READING_SESSIONS_FORBIDDEN_403,
        notFound: "Reading session not found or not accessible (404).",
      }),
    },
  });
}

export async function updateReadingSession(
  ctx: AuthenticatedClientContext,
  input: { sessionId: string; payload: { name?: string; notes?: string } },
): Promise<ReadingSessionSummary> {
  const url = resolveUrl(ctx.apiBaseUrl, `/reading/sessions/${encodeURIComponent(input.sessionId)}/`);

  return requestJson<ReadingSessionSummary>({
    apiBaseUrl: ctx.apiBaseUrl,
    accessToken: ctx.accessToken,
    tokenType: ctx.tokenType,
    endpointOrUrl: url,
    options: {
      method: "PATCH",
      body: input.payload,
      errorMessages: authErrorMessages({
        forbidden: READING_SESSIONS_MODIFY_FORBIDDEN_403,
        notFound: "Reading session not found or not accessible (404).",
      }),
    },
  });
}
