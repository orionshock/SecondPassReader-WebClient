import { ApiError } from "@secondpass/client";

function containsHtml(value: string): boolean {
  return /<!doctype\s+html\b|<html(?:\s|>)/i.test(value);
}

export function getUserFacingErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return fallback;
  if (!(error instanceof Error)) return fallback;

  const message = error.message.trim();
  return message && !containsHtml(message) ? message : fallback;
}
