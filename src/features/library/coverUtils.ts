import type { ConnectionProfile } from "../../storage/connectionProfiles";
import type { LibraryBook } from "@secondpass/client";

export function resolveCoverUrl(
  coverUrl: string | null | undefined,
  base?: { serverBaseUrl?: string | null; apiBaseUrl?: string | null } | string | null,
): string | undefined {
  const raw = typeof coverUrl === "string" ? coverUrl.trim() : "";
  if (!raw) return undefined;

  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;

  const baseUrl =
    typeof base === "string"
      ? base
      : base && typeof base === "object"
        ? base.serverBaseUrl || base.apiBaseUrl || undefined
        : undefined;
  if (!baseUrl) return undefined;

  try {
    const origin = new URL(baseUrl).origin;
    return new URL(raw, origin).toString();
  } catch {
    return undefined;
  }
}

export function getBookCoverUrl(
  book: Pick<LibraryBook, "cover_url"> | { cover_url?: string | null } | null | undefined,
  base?: ConnectionProfile | { serverBaseUrl?: string | null; apiBaseUrl?: string | null } | string | null,
): string | undefined {
  const coverUrl = book && typeof book === "object" ? book.cover_url : undefined;
  if (!coverUrl) return undefined;
  if (typeof base === "string" || base == null) return resolveCoverUrl(coverUrl, base);
  return resolveCoverUrl(coverUrl, { serverBaseUrl: base.serverBaseUrl, apiBaseUrl: base.apiBaseUrl });
}
