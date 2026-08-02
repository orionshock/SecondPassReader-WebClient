import type { PreviewBook } from "@secondpass/client";

type PreviewBookInput = {
  id: string | number;
  title: string;
  cover_url?: string | null;
  coverUrl?: string | null;
};

export function normalizePreviewBook(input: PreviewBookInput): PreviewBook {
  const coverUrl = "coverUrl" in input ? input.coverUrl : input.cover_url;
  return {
    id: String(input.id),
    title: input.title,
    coverUrl: typeof coverUrl === "string" ? coverUrl : null,
  };
}

export function normalizePreviewBooks(input: readonly PreviewBookInput[] | null | undefined): PreviewBook[] {
  return Array.isArray(input) ? input.map(normalizePreviewBook) : [];
}
