import { useMemo, useState } from "react";
import type { PreviewBook } from "@secondpass/client";
import { resolveCoverUrl } from "../coverUtils";

type CoverPreviewStripProps = {
  books?: PreviewBook[] | null;
  baseUrl?: string | { serverBaseUrl?: string | null; apiBaseUrl?: string | null } | null;
  className?: string;
};

export function CoverPreviewStrip({ books, baseUrl, className }: CoverPreviewStripProps) {
  const [brokenCoverIds, setBrokenCoverIds] = useState<Set<string>>(() => new Set());
  const previews = useMemo(() => (Array.isArray(books) ? books.slice(0, 6) : []), [books]);

  if (previews.length === 0) return null;

  return (
    <div className={`coverPreviewStrip${className ? ` ${className}` : ""}`} aria-label="Cover previews">
      {previews.map((book) => {
        const key = String(book.id);
        const coverSrc = brokenCoverIds.has(key) ? undefined : resolveCoverUrl(book.cover_url, baseUrl ?? null);

        return (
          <div key={key} className="coverPreviewTile" title={book.title}>
            {coverSrc ? (
              <img
                className="coverPreviewImage"
                src={coverSrc}
                alt={`${book.title} cover`}
                loading="lazy"
                onError={() => {
                  setBrokenCoverIds((current) => {
                    const next = new Set(current);
                    next.add(key);
                    return next;
                  });
                }}
              />
            ) : (
              <div className="coverPreviewPlaceholder" aria-label={`${book.title} has no cover`}>
                No cover
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
