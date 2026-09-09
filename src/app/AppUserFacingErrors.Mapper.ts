import { ApiError } from "@secondpass/client";

function containsHtml(value: string): boolean {
  return /<!doctype\s+html\b|<html(?:\s|>)/i.test(value);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.trim() : "";
}

export function isAuthorizationError(error: unknown): boolean {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return true;
    if (error.kind === "unauthorized" || error.kind === "forbidden") return true;
  }

  if (error instanceof Error && "cause" in error && error.cause !== error) {
    if (isAuthorizationError(error.cause)) return true;
  }

  return /\btoken\b[^.\n]*\bnot allowed\b/i.test(getErrorMessage(error));
}

export function isAuthenticationRepairError(error: unknown): boolean {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.kind === "unauthorized") return true;
  }

  if (error instanceof Error && "cause" in error && error.cause !== error) {
    return isAuthenticationRepairError(error.cause);
  }

  return false;
}

export function getAuthRecoveryMessage(resourceAction: string): string {
  return `This device is not authorized to ${resourceAction}.`;
}

export function getUserFacingErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return fallback;
  if (!(error instanceof Error)) return fallback;

  const message = error.message.trim();
  return message && !containsHtml(message) ? message : fallback;
}

export function getPageLoadErrorMessage(
  error: unknown,
  fallback: string,
  authFallback: string,
): string {
  return isAuthorizationError(error) ? authFallback : fallback;
}

export function getTechnicalErrorDetail(error: unknown): string | null {
  if (error instanceof ApiError) {
    const status = [error.status, error.statusText].filter(Boolean).join(" ");
    return status ? `Request failed: ${status}` : null;
  }
  if (error instanceof Error && "cause" in error && error.cause !== error) {
    return getTechnicalErrorDetail(error.cause);
  }
  const message = getErrorMessage(error);
  return message && !containsHtml(message) ? message : null;
}
