import type {
  ReadingAnnotation,
  ReadingAnnotationBatchCreatePayload,
  ReadingAnnotationBatchCreateResponse,
  ReadingAnnotationCreatePayload,
  ReadingAnnotationPage,
  ReadingAnnotationUpdatePayload,
} from "./schemas/readingSession";
import type { AuthenticatedClientContext } from "./clientContext";
import { authErrorMessages, requestJson, resolveUrl } from "./apiHttp";

const READING_ANNOTATIONS_LIST_FORBIDDEN_403 = "Token cannot list reading annotations (403).";
const READING_ANNOTATIONS_CREATE_FORBIDDEN_403 = "Token cannot create reading annotations (403).";
const READING_ANNOTATIONS_UPDATE_FORBIDDEN_403 = "Token cannot update reading annotations (403).";
const READING_ANNOTATIONS_DELETE_FORBIDDEN_403 = "Token cannot delete reading annotations (403).";

export type CreateHighlightInput = {
  sessionId: string;
  profileVersion: string;
  cfiRange: string;
  text?: string;
  color?: string;
  note?: string;
  quotePrefix?: string;
  quoteSuffix?: string;
};

export type CreateBookmarkInput = {
  sessionId: string;
  profileVersion: string;
  cfi: string;
};

export type UpdateNoteInput = {
  profileVersion?: string;
  note?: string | null;
  color?: string | null;
  text?: string;
};

export type ReadingAnnotationKind = "highlight" | "bookmark";

export type ReadingAnnotationsOrdering = "created" | "-created" | "modified" | "-modified";

export type ListReadingAnnotationsInput = {
  sessionId: string;
  page?: number;
  kind?: ReadingAnnotationKind | ReadingAnnotationKind[];
  ordering?: ReadingAnnotationsOrdering;
};

export async function createHighlightAnnotation(input: {
  ctx: AuthenticatedClientContext;
  create: CreateHighlightInput;
  idempotencyKey?: string;
}): Promise<ReadingAnnotation> {
  const cfiRange = input.create.cfiRange.trim();
  if (!cfiRange) throw new Error("Highlight requires a cfiRange.");

  const text = typeof input.create.text === "string" ? input.create.text.trim() : "";
  const note = typeof input.create.note === "string" ? input.create.note.trim() : "";
  const color = typeof input.create.color === "string" ? input.create.color.trim() : "";

  const payload: ReadingAnnotationCreatePayload = {
    profile_version: input.create.profileVersion,
    session: input.create.sessionId,
    kind: "highlight",
    selector: cfiRange,
    highlight_text: text,
    quote: text,
    highlight_color: color || "yellow",
    ...(note ? { comment_text: note } : {}),
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
    kind: "bookmark",
    selector: cfi,
  };

  return createReadingAnnotation(input.ctx, { payload, idempotencyKey: input.idempotencyKey });
}

export async function updateNoteAnnotation(input: {
  ctx: AuthenticatedClientContext;
  annotationId: string;
  update: UpdateNoteInput;
}): Promise<ReadingAnnotation> {
  const colorRaw = typeof input.update.color === "string" ? input.update.color : "";
  const color = colorRaw.trim();

  const noteVal = input.update.note;
  const noteRaw = typeof noteVal === "string" ? noteVal : noteVal === null ? "" : "";
  const note = noteRaw.trim();

  const payload: ReadingAnnotationUpdatePayload = {
    ...(color ? { highlight_color: color } : {}),
    ...(noteVal === null || typeof noteVal === "string" ? { comment_text: note } : {}),
  };

  return updateReadingAnnotation(input.ctx, { annotationId: input.annotationId, payload });
}

export async function listReadingAnnotations(input: {
  ctx: AuthenticatedClientContext;
  params: ListReadingAnnotationsInput;
}): Promise<ReadingAnnotationPage> {
  const url = new URL(resolveUrl(input.ctx.apiBaseUrl, "/reading/annotations/"));
  url.searchParams.set("session_id", input.params.sessionId);
  if (input.params.page !== undefined) url.searchParams.set("page", String(input.params.page));
  if (input.params.ordering) url.searchParams.set("ordering", input.params.ordering);
  if (input.params.kind) {
    const kinds = Array.isArray(input.params.kind) ? input.params.kind : [input.params.kind];
    for (const k of kinds) {
      const s = typeof k === "string" ? k.trim() : "";
      if (s) url.searchParams.append("kind", s);
    }
  }

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

export async function batchCreateReadingAnnotations(
  ctx: AuthenticatedClientContext,
  input: { payload: ReadingAnnotationBatchCreatePayload; idempotencyKey?: string },
): Promise<ReadingAnnotationBatchCreateResponse> {
  if (input.payload.items.length > 100) throw new Error("Annotation batch create supports at most 100 items.");
  const url = resolveUrl(ctx.apiBaseUrl, "/reading/annotations/batch/");

  return requestJson<ReadingAnnotationBatchCreateResponse>({
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
        notFound: "Reading annotation batch endpoint not found (404).",
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
