import type {
  ReadingProgress,
  ReadingProgressUpdatePayload,
} from "./schemas/readingSession";
import type { AuthenticatedClientContext } from "./clientContext";
import { authErrorMessages, requestJson, resolveUrl } from "./apiHttp";

const READING_PROGRESS_UPDATE_FORBIDDEN_403 = "Token cannot update reading progress (403).";

export type SaveReadingProgressInput = {
  profileVersion: string;
  cfi: string;
  href?: string;
  bookProgress?: number | null;
  format?: "epub" | string;
};

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
