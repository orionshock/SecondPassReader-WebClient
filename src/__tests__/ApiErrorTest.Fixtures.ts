import { ApiError } from "@secondpass/client";

export function apiError(status: number, message: string, kind: "http_error" | "unauthorized" = "http_error"): ApiError {
  return new ApiError({ kind, status, message });
}

export function authorizationError(status = 403): ApiError {
  return apiError(status, "Token is not allowed.", status === 401 ? "unauthorized" : "http_error");
}

export function htmlApiError(): ApiError {
  return new ApiError({
    kind: "http_error",
    status: 404,
    statusText: "Not Found",
    message: "Request failed: 404 Not Found - <!DOCTYPE html><html><body>Django debug page</body></html>",
  });
}
