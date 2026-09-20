import { ApiError, ApiTransportError } from "@secondpass/client";

export const OFFLINE_RETRY_BASE_DELAY_MS = 30_000;
export const OFFLINE_RETRY_MAX_DELAY_MS = 15 * 60_000;

export type OfflineDeliveryFailureInput =
  | { kind: "network" }
  | {
      kind: "http";
      status: number;
      code?: string | null;
      retryAfterMs?: number | null;
    };

export type OfflineDeliveryFailureClass =
  | { classification: "retry-later"; retryAfterMs: number | null }
  | { classification: "reauthenticate" }
  | { classification: "refresh-authority" }
  | { classification: "session-closed" }
  | { classification: "terminal-request" }
  | { classification: "unknown" };

export function classifyOfflineDeliveryFailure(
  error: unknown,
): OfflineDeliveryFailureClass {
  const failure = normalizeFailure(error);
  if (!failure) return { classification: "unknown" };
  if (failure.kind === "network") {
    return { classification: "retry-later", retryAfterMs: null };
  }

  const code = normalizeCode(failure.code);
  if (failure.status === 409 && code === "SESSION_CLOSED") {
    return { classification: "session-closed" };
  }
  if (code === "IDEMPOTENCY_IN_PROGRESS") {
    return { classification: "retry-later", retryAfterMs: normalizeDelay(failure.retryAfterMs) };
  }
  if (code === "IDEMPOTENCY_KEY_REUSED") {
    return { classification: "terminal-request" };
  }
  if (failure.status === 400) return { classification: "terminal-request" };
  if (failure.status === 401) return { classification: "reauthenticate" };
  if (failure.status === 403 || failure.status === 404) {
    return { classification: "refresh-authority" };
  }
  if (failure.status === 429) {
    return { classification: "retry-later", retryAfterMs: normalizeDelay(failure.retryAfterMs) };
  }
  if (failure.status >= 500 && failure.status <= 599) {
    return { classification: "retry-later", retryAfterMs: null };
  }

  return { classification: "unknown" };
}

export function computeOfflineRetryDelay(input: {
  attempt: number;
  retryAfterMs?: number | null;
}): number {
  const retryAfterMs = normalizeDelay(input.retryAfterMs);
  if (retryAfterMs !== null) return retryAfterMs;

  const attempt = Number.isFinite(input.attempt)
    ? Math.max(1, Math.floor(input.attempt))
    : 1;
  const exponent = Math.min(30, attempt - 1);
  return Math.min(
    OFFLINE_RETRY_MAX_DELAY_MS,
    OFFLINE_RETRY_BASE_DELAY_MS * (2 ** exponent),
  );
}

function normalizeFailure(error: unknown): OfflineDeliveryFailureInput | null {
  if (error instanceof ApiTransportError) return { kind: "network" };
  if (error instanceof ApiError) {
    return {
      kind: "http",
      status: error.status,
      code: extractKnownCode(error.message),
    };
  }
  if (!isRecord(error)) return null;
  if (error.kind === "network") return { kind: "network" };
  if (error.kind !== "http" || typeof error.status !== "number") return null;

  return {
    kind: "http",
    status: error.status,
    code: typeof error.code === "string" ? error.code : null,
    retryAfterMs: typeof error.retryAfterMs === "number" ? error.retryAfterMs : null,
  };
}

function extractKnownCode(message: string): string | null {
  const knownCodes = [
    "SESSION_CLOSED",
    "IDEMPOTENCY_IN_PROGRESS",
    "IDEMPOTENCY_KEY_REUSED",
  ];
  return knownCodes.find((code) => new RegExp(`\\b${code}\\b`).test(message)) ?? null;
}

function normalizeCode(code: string | null | undefined): string | null {
  const value = code?.trim().toUpperCase();
  return value || null;
}

function normalizeDelay(delay: number | null | undefined): number | null {
  return typeof delay === "number" && Number.isFinite(delay) && delay >= 0
    ? Math.ceil(delay)
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
