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
} from "./schemas/readingSession";
import type { PaginatedResponse } from "./schemas/library";
import type { AuthenticatedClientContext } from "./clientContext";
import { authErrorMessages, requestJson, resolveUrl } from "./apiHttp";

const READING_SESSIONS_FORBIDDEN_403 = "Token is not allowed to access reading sessions (403).";
const READING_DATA_FORBIDDEN_403 = "Token is not allowed to access reading data (403).";
const READING_MODIFY_FORBIDDEN_403 = "Token is not allowed to modify reading data (403).";
const READING_START_OVER_FORBIDDEN_403 = "Token is not allowed to start over reading sessions (403).";
const READING_PROGRESS_UPDATE_FORBIDDEN_403 = "Token cannot update reading progress (403).";
const READING_ANNOTATIONS_LIST_FORBIDDEN_403 = "Token cannot list reading annotations (403).";
const READING_ANNOTATIONS_CREATE_FORBIDDEN_403 = "Token cannot create reading annotations (403).";
const READING_ANNOTATIONS_UPDATE_FORBIDDEN_403 = "Token cannot update reading annotations (403).";
const READING_ANNOTATIONS_DELETE_FORBIDDEN_403 = "Token cannot delete reading annotations (403).";
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

export async function updateReadingProgress(
  ctx: AuthenticatedClientContext,
  input: { sessionId: string; payload: ReadingProgressUpdatePayload; method?: "PUT" | "PATCH" },
): Promise<ReadingProgress> {
  const url = resolveUrl(ctx.apiBaseUrl, `/reading/sessions/${encodeURIComponent(input.sessionId)}/progress/`);

  return requestJson<ReadingProgress>({
    apiBaseUrl: ctx.apiBaseUrl,
    accessToken: ctx.accessToken,
    tokenType: ctx.tokenType,
    endpointOrUrl: url,
    options: {
      method: input.method ?? "PATCH",
      body: input.payload,
      errorMessages: authErrorMessages({
        forbidden: READING_PROGRESS_UPDATE_FORBIDDEN_403,
        notFound: "Reading session not found (404).",
      }),
    },
  });
}

export type SaveReadingProgressInput = {
  profileVersion: string;
  cfi: string;
  href?: string;
  bookProgress?: number | null;
  format?: "epub" | string;
};

export type CreateHighlightInput = {
  sessionId: string;
  profileVersion: string;
  cfiRange: string;
  text?: string;
  color?: string;
  note?: string;
};

export type CreateBookmarkInput = {
  sessionId: string;
  profileVersion: string;
  cfi: string;
};

export type UpdateNoteInput = {
  profileVersion: string;
  sessionId: string;
  // Keep motivation explicit for correctness; default to "commenting" for note updates.
  motivation?: "commenting" | "highlighting" | "bookmarking" | string;
  cfi: string;
  note?: string;
  color?: string;
  text?: string;
};

export async function saveReadingProgress(input: {
  ctx: AuthenticatedClientContext;
  sessionId: string;
  progress: SaveReadingProgressInput;
}): Promise<ReadingProgress> {
  const cfi = input.progress.cfi.trim();
  if (!cfi) throw new Error("Cannot save reading progress without a CFI.");

  const payload: ReadingProgressUpdatePayload = {
    profile_version: input.progress.profileVersion,
    current_location: {
      format: input.progress.format ?? "epub",
      cfi,
    },
  };

  const href = typeof input.progress.href === "string" ? input.progress.href.trim() : "";
  if (href) (payload.current_location as NonNullable<ReadingProgressUpdatePayload["current_location"]>).href = href;

  const p = input.progress.bookProgress;
  if (typeof p === "number" && Number.isFinite(p)) payload.progression = p;

  return updateReadingProgress(input.ctx, { sessionId: input.sessionId, payload, method: "PATCH" });
}

const EPUB_CFI_CONFORMS_TO = "http://www.idpf.org/epub/linking/cfi/epub-cfi.html";

export async function createHighlightAnnotation(input: {
  ctx: AuthenticatedClientContext;
  create: CreateHighlightInput;
  idempotencyKey?: string;
}): Promise<ReadingAnnotation> {
  const cfiRange = input.create.cfiRange.trim();
  if (!cfiRange) throw new Error("Highlight requires a cfiRange.");

  const body: ReadingAnnotationCreatePayload["body"] = [];
  const text = typeof input.create.text === "string" ? input.create.text.trim() : "";
  if (text) {
    body.push({
      type: "TextualBody",
      purpose: "describing",
      value: text,
      ...(input.create.color ? { color: input.create.color } : {}),
    });
  }
  const note = typeof input.create.note === "string" ? input.create.note.trim() : "";
  if (note) {
    body.push({
      type: "TextualBody",
      purpose: "commenting",
      value: note,
    });
  }

  const payload: ReadingAnnotationCreatePayload = {
    profile_version: input.create.profileVersion,
    session: input.create.sessionId,
    motivation: "highlighting",
    target: {
      selector: {
        type: "FragmentSelector",
        conformsTo: EPUB_CFI_CONFORMS_TO,
        value: cfiRange,
      },
    },
    ...(body.length ? { body } : {}),
  };

  return createReadingAnnotation(input.ctx, { payload, idempotencyKey: input.idempotencyKey });
}

export async function createBookmarkAnnotation(input: {
  ctx: AuthenticatedClientContext;
  create: CreateBookmarkInput;
  idempotencyKey?: string;
}): Promise<ReadingAnnotation> {
  const cfi = input.create.cfi.trim();
  if (!cfi) throw new Error("Bookmark requires a cfi.");

  const payload: ReadingAnnotationCreatePayload = {
    profile_version: input.create.profileVersion,
    session: input.create.sessionId,
    motivation: "bookmarking",
    target: {
      selector: {
        type: "FragmentSelector",
        conformsTo: EPUB_CFI_CONFORMS_TO,
        value: cfi,
      },
    },
  };

  return createReadingAnnotation(input.ctx, { payload, idempotencyKey: input.idempotencyKey });
}

export async function updateNoteAnnotation(input: {
  ctx: AuthenticatedClientContext;
  annotationId: string;
  update: UpdateNoteInput;
}): Promise<ReadingAnnotation> {
  const cfi = input.update.cfi.trim();
  if (!cfi) throw new Error("Note update requires a cfi.");

  const body: ReadingAnnotationUpdatePayload["body"] = [];
  const text = typeof input.update.text === "string" ? input.update.text.trim() : "";
  if (text) {
    body.push({
      type: "TextualBody",
      purpose: "describing",
      value: text,
      ...(input.update.color ? { color: input.update.color } : {}),
    });
  }
  const note = typeof input.update.note === "string" ? input.update.note.trim() : "";
  if (note) {
    body.push({
      type: "TextualBody",
      purpose: "commenting",
      value: note,
    });
  }

  const payload: ReadingAnnotationUpdatePayload = {
    profile_version: input.update.profileVersion,
    session: input.update.sessionId,
    motivation: input.update.motivation ?? "commenting",
    target: {
      selector: {
        type: "FragmentSelector",
        conformsTo: EPUB_CFI_CONFORMS_TO,
        value: cfi,
      },
    },
    ...(body.length ? { body } : {}),
  };

  return updateReadingAnnotation(input.ctx, { annotationId: input.annotationId, payload });
}

export async function listReadingAnnotations(input: {
  ctx: AuthenticatedClientContext;
  sessionId: string;
  page?: number;
}): Promise<ReadingAnnotationPage> {
  const url = new URL(resolveUrl(input.ctx.apiBaseUrl, "/reading/annotations/"));
  url.searchParams.set("session_id", input.sessionId);
  if (input.page !== undefined) url.searchParams.set("page", String(input.page));

  return requestJson<ReadingAnnotationPage>({
    apiBaseUrl: input.ctx.apiBaseUrl,
    accessToken: input.ctx.accessToken,
    tokenType: input.ctx.tokenType,
    endpointOrUrl: url.toString(),
    options: {
      errorMessages: authErrorMessages({
        forbidden: READING_ANNOTATIONS_LIST_FORBIDDEN_403,
        notFound: "Reading annotations endpoint not found (404).",
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
}): Promise<PaginatedResponse<ReadingSessionSummary>> {
  const url = new URL(resolveUrl(input.ctx.apiBaseUrl, "/reading/sessions/"));
  if (input.page !== undefined) url.searchParams.set("page", String(input.page));
  if (input.pageSize !== undefined) url.searchParams.set("page_size", String(input.pageSize));
  if (input.bookId !== undefined) url.searchParams.set("book", String(input.bookId));
  if (input.status) url.searchParams.set("status", String(input.status));
  if (input.isActive !== undefined) url.searchParams.set("is_active", input.isActive ? "true" : "false");

  return requestJson<PaginatedResponse<ReadingSessionSummary>>({
    apiBaseUrl: input.ctx.apiBaseUrl,
    accessToken: input.ctx.accessToken,
    tokenType: input.ctx.tokenType,
    endpointOrUrl: url.toString(),
    options: {
      errorMessages: authErrorMessages({ forbidden: READING_SESSIONS_FORBIDDEN_403 }),
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

export async function createReadingAnnotation(
  ctx: AuthenticatedClientContext,
  input: { payload: ReadingAnnotationCreatePayload; idempotencyKey?: string },
): Promise<ReadingAnnotation> {
  const url = resolveUrl(ctx.apiBaseUrl, "/reading/annotations/");

  return requestJson<ReadingAnnotation>({
    apiBaseUrl: ctx.apiBaseUrl,
    accessToken: ctx.accessToken,
    tokenType: ctx.tokenType,
    endpointOrUrl: url,
    options: {
      method: "POST",
      body: input.payload,
      headers: input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : undefined,
      errorMessages: authErrorMessages({
        forbidden: READING_ANNOTATIONS_CREATE_FORBIDDEN_403,
        notFound: "Reading annotations endpoint not found (404).",
      }),
    },
  });
}

export async function updateReadingAnnotation(
  ctx: AuthenticatedClientContext,
  input: { annotationId: string; payload: ReadingAnnotationUpdatePayload },
): Promise<ReadingAnnotation> {
  const url = resolveUrl(ctx.apiBaseUrl, `/reading/annotations/${encodeURIComponent(input.annotationId)}/`);

  return requestJson<ReadingAnnotation>({
    apiBaseUrl: ctx.apiBaseUrl,
    accessToken: ctx.accessToken,
    tokenType: ctx.tokenType,
    endpointOrUrl: url,
    options: {
      method: "PATCH",
      body: input.payload,
      errorMessages: authErrorMessages({
        forbidden: READING_ANNOTATIONS_UPDATE_FORBIDDEN_403,
        notFound: "Reading annotation not found (404).",
      }),
    },
  });
}

export async function deleteReadingAnnotation(
  ctx: AuthenticatedClientContext,
  input: { annotationId: string },
): Promise<void> {
  const url = resolveUrl(ctx.apiBaseUrl, `/reading/annotations/${encodeURIComponent(input.annotationId)}/`);

  await requestJson<unknown>({
    apiBaseUrl: ctx.apiBaseUrl,
    accessToken: ctx.accessToken,
    tokenType: ctx.tokenType,
    endpointOrUrl: url,
    options: {
      method: "DELETE",
      errorMessages: authErrorMessages({
        forbidden: READING_ANNOTATIONS_DELETE_FORBIDDEN_403,
        notFound: "Reading annotation not found (404).",
      }),
    },
  });
}
