import { useState, type MouseEvent } from "react";
import { resolveCoverUrl } from "../BookCover.Mapper";
import type { PreviewBook } from "@secondpass/client";

type PreviewBookCoverStackProps = {
  previewBooks: PreviewBook[];
  baseUrl?: string | { serverBaseUrl?: string | null; apiBaseUrl?: string | null } | null;
  maxCovers?: number;
  variant?: "compact" | "homeShelf";
  emptyLabel?: string;
  decorative?: boolean;
  onBookClick?: (bookId: string) => void;
};

export function PreviewBookCoverStack({
  previewBooks,
  baseUrl,
  maxCovers = 3,
  variant = "compact",
  emptyLabel = "No books",
  decorative = false,
  onBookClick,
}: PreviewBookCoverStackProps) {
  const [brokenCoverIds, setBrokenCoverIds] = useState<Set<string>>(() => new Set());
  const visibleBooks = previewBooks.slice(0, Math.max(0, maxCovers));
  const className = `previewBookCoverStack previewBookCoverStack${variant === "homeShelf" ? "HomeShelf" : "Compact"}`;

  return (
    <span className={className} aria-hidden={decorative ? "true" : undefined} aria-label={decorative ? undefined : "Cover previews"}>
      {visibleBooks.length > 0 ? visibleBooks.map((book) => {
        const coverSrc = brokenCoverIds.has(book.id) ? undefined : resolveCoverUrl(book.coverUrl, baseUrl ?? null);
        const content = coverSrc ? (
          <img
            className="previewBookCoverImage"
            src={coverSrc}
            alt={decorative || Boolean(onBookClick) ? "" : book.title}
            title={book.title}
            loading="lazy"
            onError={() => {
              setBrokenCoverIds((current) => {
                const next = new Set(current);
                next.add(book.id);
                return next;
              });
            }}
          />
        ) : (
          <span className="previewBookCoverPlaceholder" aria-hidden={decorative || Boolean(onBookClick) ? "true" : undefined} aria-label={decorative || onBookClick ? undefined : `${book.title} has no cover`}>
            No cover
          </span>
        );

        if (onBookClick) {
          const label = `View details for ${book.title}`;
          return (
            <button
              key={book.id}
              type="button"
              className="previewBookCoverTile previewBookCoverButton"
              title={label}
              aria-label={label}
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                onBookClick(book.id);
              }}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {content}
            </button>
          );
        }

        return (
          <span key={book.id} className="previewBookCoverTile" title={book.title}>
            {content}
          </span>
        );
      }) : (
        <span className="previewBookCoverTile previewBookCoverTileEmpty">
          <span className="previewBookCoverPlaceholder">{emptyLabel}</span>
        </span>
      )}
    </span>
  );
}
