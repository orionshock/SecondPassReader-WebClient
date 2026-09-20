import { ApiError, ApiTransportError } from "@secondpass/client";
import { describe, expect, it } from "vitest";
import {
  classifyOfflineDeliveryFailure,
  computeOfflineRetryDelay,
  OFFLINE_RETRY_BASE_DELAY_MS,
  OFFLINE_RETRY_MAX_DELAY_MS,
} from "../../../../app/offline/reader/retry/OfflineRetry.Policy";

describe("offline delivery retry policy", () => {
  it("classifies normalized network interruption for later retry", () => {
    expect(classifyOfflineDeliveryFailure({ kind: "network" })).toEqual({
      classification: "retry-later",
      retryAfterMs: null,
    });
    expect(classifyOfflineDeliveryFailure(new ApiTransportError(new TypeError("Failed to fetch")))).toEqual({
      classification: "retry-later",
      retryAfterMs: null,
    });
  });

  it.each([500, 503])("classifies HTTP %s as retryable", (status) => {
    expect(classifyOfflineDeliveryFailure(apiError(status, "raw server content"))).toEqual({
      classification: "retry-later",
      retryAfterMs: null,
    });
  });

  it("classifies rate limiting with safe server delay metadata", () => {
    expect(classifyOfflineDeliveryFailure({ kind: "http", status: 429, retryAfterMs: 45_000 })).toEqual({
      classification: "retry-later",
      retryAfterMs: 45_000,
    });
  });

  it.each([
    { status: 401, classification: "reauthenticate" },
    { status: 403, classification: "refresh-authority" },
    { status: 404, classification: "refresh-authority" },
    { status: 400, classification: "terminal-request" },
  ] as const)("classifies HTTP $status as $classification", ({ status, classification }) => {
    expect(classifyOfflineDeliveryFailure(apiError(status, "sensitive response body"))).toEqual({ classification });
  });

  it("keeps SESSION_CLOSED distinct from terminal request failure", () => {
    expect(classifyOfflineDeliveryFailure({
      kind: "http",
      status: 409,
      code: "SESSION_CLOSED",
    })).toEqual({ classification: "session-closed" });
    expect(classifyOfflineDeliveryFailure(apiError(409, "Request failed - SESSION_CLOSED"))).toEqual({
      classification: "session-closed",
    });
  });

  it("does not guess at an unrecognized conflict or error", () => {
    expect(classifyOfflineDeliveryFailure(apiError(409, "different conflict"))).toEqual({
      classification: "unknown",
    });
    expect(classifyOfflineDeliveryFailure(new Error("mystery with token=secret"))).toEqual({
      classification: "unknown",
    });
    expect(classifyOfflineDeliveryFailure(new TypeError("application bug"))).toEqual({
      classification: "unknown",
    });
  });

  it("classifies known idempotency states without retaining their raw input", () => {
    const retry = classifyOfflineDeliveryFailure({
      kind: "http",
      status: 409,
      code: "IDEMPOTENCY_IN_PROGRESS",
      retryAfterMs: 20_000,
      responseBody: "secret",
    });
    const terminal = classifyOfflineDeliveryFailure({
      kind: "http",
      status: 409,
      code: "IDEMPOTENCY_KEY_REUSED",
      requestUrl: "https://library.example/private",
    });

    expect(retry).toEqual({ classification: "retry-later", retryAfterMs: 20_000 });
    expect(terminal).toEqual({ classification: "terminal-request" });
    expect(JSON.stringify([retry, terminal])).not.toContain("secret");
    expect(JSON.stringify([retry, terminal])).not.toContain("library.example");
  });

  it("starts exponential backoff at thirty seconds", () => {
    expect(computeOfflineRetryDelay({ attempt: 1 })).toBe(OFFLINE_RETRY_BASE_DELAY_MS);
    expect(computeOfflineRetryDelay({ attempt: 2 })).toBe(60_000);
  });

  it("caps exponential backoff at fifteen minutes", () => {
    expect(computeOfflineRetryDelay({ attempt: 20 })).toBe(OFFLINE_RETRY_MAX_DELAY_MS);
  });

  it("uses a valid server retry delay instead of local backoff", () => {
    expect(computeOfflineRetryDelay({ attempt: 1, retryAfterMs: 120_000 })).toBe(120_000);
    expect(computeOfflineRetryDelay({ attempt: 20, retryAfterMs: 1_200_000 })).toBe(1_200_000);
  });
});

function apiError(status: number, message: string): ApiError {
  return new ApiError({ kind: "http_error", status, message });
}
