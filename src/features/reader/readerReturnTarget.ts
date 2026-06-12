import type { ReaderReturnTarget } from "./types";

const STORAGE_PREFIX = "secondpass.reader.returnTarget.";

export const DEFAULT_READER_RETURN_TARGET: ReaderReturnTarget = {
  kind: "home",
  label: "Home",
  route: "#/home",
};

const RETURN_TARGET_KINDS = new Set<ReaderReturnTarget["kind"]>([
  "home",
  "library",
  "shelf",
  "sessions",
  "bookDetail",
  "series",
]);

function storageKey(bookId: string | number): string {
  return `${STORAGE_PREFIX}${String(bookId)}`;
}

function isInternalHashRoute(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const route = value.trim();
  return route === "#/" || route.startsWith("#/");
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function sanitizeReaderReturnTarget(value: unknown): ReaderReturnTarget | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const kind = raw.kind;
  const label = normalizeString(raw.label);
  const route = raw.route;
  if (typeof kind !== "string" || !RETURN_TARGET_KINDS.has(kind as ReaderReturnTarget["kind"])) return null;
  if (!label || !isInternalHashRoute(route)) return null;

  return {
    kind: kind as ReaderReturnTarget["kind"],
    label,
    route: route.trim(),
    bookId: normalizeString(raw.bookId),
    shelfId: normalizeString(raw.shelfId),
    sessionId: normalizeString(raw.sessionId),
    seriesId: normalizeString(raw.seriesId),
  };
}

export function getReaderReturnTarget(bookId: string | number): ReaderReturnTarget {
  try {
    const raw = window.sessionStorage.getItem(storageKey(bookId));
    if (!raw) return DEFAULT_READER_RETURN_TARGET;
    return sanitizeReaderReturnTarget(JSON.parse(raw)) ?? DEFAULT_READER_RETURN_TARGET;
  } catch {
    return DEFAULT_READER_RETURN_TARGET;
  }
}

export function saveReaderReturnTarget(bookId: string | number, target?: ReaderReturnTarget | null): ReaderReturnTarget {
  const safeTarget = sanitizeReaderReturnTarget(target) ?? DEFAULT_READER_RETURN_TARGET;
  try {
    window.sessionStorage.setItem(storageKey(bookId), JSON.stringify(safeTarget));
  } catch {
    // Session storage is best-effort launch context; default target still works.
  }
  return safeTarget;
}

export function buildReturnLabel(target: ReaderReturnTarget): string {
  return target.kind === "home" ? "Return Home" : `Return to ${target.label}`;
}
