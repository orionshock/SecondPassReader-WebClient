import type {
  ReadingAnnotation,
  ReadingAnnotationCreatePayload,
  ReadingAnnotationPage,
  ReadingAnnotationUpdatePayload,
  ReadingOpenResponse,
  ReadingProgress,
  ReadingProgressUpdatePayload,
  ReadingBookActivitySummaryResponse,
  ReadingRecentSessionsResponse,
  ReadingSessionsListResponse,
  ReadingSessionSummary,
  ReadingSession,
} from "./schemas/readingSession";
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
  /**
   * Optional W3C TextQuoteSelector context.
   *
   * - `cfiRange` remains the primary anchor.
   * - prefix/suffix are repair/export metadata, not display text.
   * - The reader/selection layer decides what context is useful.
   * - The client clamps prefix/suffix to server limits (500 chars).
   */
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
  /**
   * Describing text for highlight updates.
   *
   * The server stores highlight color on the describing body; to update highlight color,
   * the client must also provide the describing text value.
   */
  text?: string;
};

export type ReadingAnnotationMotivation = "highlighting" | "bookmarking" | "commenting" | (string & {});

export type ReadingAnnotationsOrdering = "created" | "-created" | "modified" | "-modified";

export type ListReadingAnnotationsInput = {
  sessionId: string;
  page?: number;
  motivation?: ReadingAnnotationMotivation | ReadingAnnotationMotivation[];
  ordering?: ReadingAnnotationsOrdering;
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
  const quotePrefixRaw = typeof input.create.quotePrefix === "string" ? input.create.quotePrefix : "";
  const quoteSuffixRaw = typeof input.create.quoteSuffix === "string" ? input.create.quoteSuffix : "";

  const clampQuoteContext = (value: string): string | undefined => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed.length <= 500) return trimmed;
    return trimmed.slice(0, 500);
  };

  const quotePrefix = clampQuoteContext(quotePrefixRaw);
  const quoteSuffix = clampQuoteContext(quoteSuffixRaw);
  const hasQuoteContext = Boolean(quotePrefix || quoteSuffix);
  if (hasQuoteContext && !text) {
    throw new Error("Highlight quote context requires `text` (used as TextQuoteSelector.exact).");
  }

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

  const fragmentSelector: ReadingAnnotationCreatePayload["target"]["selector"] =
    // Cast the fragment selector shape; the schema type allows this object directly.
    {
      type: "FragmentSelector",
      conformsTo: EPUB_CFI_CONFORMS_TO,
      value: cfiRange,
    } as ReadingAnnotationCreatePayload["target"]["selector"];

  const selector: ReadingAnnotationCreatePayload["target"]["selector"] = hasQuoteContext
    ? ([
        fragmentSelector,
        {
          type: "TextQuoteSelector",
          // Must match the describing body text when both are present.
          exact: text,
          ...(quotePrefix ? { prefix: quotePrefix } : {}),
          ...(quoteSuffix ? { suffix: quoteSuffix } : {}),
        },
      ] as unknown as ReadingAnnotationCreatePayload["target"]["selector"])
    : fragmentSelector;

  const payload: ReadingAnnotationCreatePayload = {
    profile_version: input.create.profileVersion,
    session: input.create.sessionId,
    motivation: note ? ["highlighting", "commenting"] : ["highlighting"],
    target: {
      selector,
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
    motivation: ["bookmarking"],
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
  const body: ReadingAnnotationUpdatePayload["body"] = [];

  const textRaw = typeof input.update.text === "string" ? input.update.text : "";
  const text = textRaw.trim();

  const colorRaw = typeof input.update.color === "string" ? input.update.color : "";
  const color = colorRaw.trim();

  if (color && !text) throw new Error("Updating highlight color requires `text` (describing body value).");

  // Server profile: highlight color is stored on the describing body.
  // We don't mutate anchors on PATCH; only body updates are allowed.
  // Policy:
  // - If `text` is provided, always include the describing body.
  //   This allows callers to clear notes by sending only the describing body.
  if (text) {
    body.push({
      type: "TextualBody",
      purpose: "describing",
      value: text,
      ...(color ? { color } : {}),
    });
  }

  const noteVal = input.update.note;
  const noteRaw = typeof noteVal === "string" ? noteVal : noteVal === null ? "" : "";
  const note = noteRaw.trim();
  // Server contract: note/comment text is stored in a `commenting` TextualBody.
  // Clearing a note should be an explicit operation on PATCH.
  // - `note: null` or whitespace-only indicates the note should be removed.
  // - Encode removal by sending an explicit commenting body with an empty value.
  //   The server treats this as a clear/remove instruction.
  if (note) {
    body.push({
      type: "TextualBody",
      purpose: "commenting",
      value: note,
    });
  } else if (noteVal === null || (typeof noteVal === "string" && noteVal.length > 0)) {
    body.push({
      type: "TextualBody",
      purpose: "commenting",
      value: "",
    });
  }

  const payload: ReadingAnnotationUpdatePayload = {
    ...(input.update.profileVersion ? { profile_version: input.update.profileVersion } : {}),
    ...(body.length ? { body } : {}),
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
  if (input.params.motivation) {
    const motivations = Array.isArray(input.params.motivation) ? input.params.motivation : [input.params.motivation];
    for (const m of motivations) {
      const s = typeof m === "string" ? m.trim() : "";
      if (s) url.searchParams.append("motivation", s);
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
