import { useState } from "react";
import type { Shelf } from "@secondpass/client";
import { resolveCoverUrl } from "../library/coverUtils";

export function HomeShelfCard({
  shelf,
  baseUrl,
  href,
}: {
  shelf: Shelf;
  baseUrl?: string | null;
  href: string;
}) {
  const [brokenCoverIds, setBrokenCoverIds] = useState<Set<string>>(() => new Set());
  const previews = Array.isArray(shelf.preview_books) ? shelf.preview_books.slice(0, 3) : [];
  const count = shelf.item_count ?? 0;
  const ownerLabel = getShelfOwnerLabel(shelf);

  return (
    <a
      className="homeShelfCard"
      aria-label={`Open shelf ${shelf.name}, ${count} ${count === 1 ? "book" : "books"}`}
      title={shelf.description ?? undefined}
      href={href}
    >
      <span className="homeShelfCovers" aria-hidden="true">
        {previews.length ? previews.map((book) => {
          const bookId = String(book.id);
          const coverSrc = brokenCoverIds.has(bookId) ? undefined : resolveCoverUrl(book.cover_url, baseUrl ?? null);
          return (
            <span className="homeShelfCover" key={bookId}>
              {coverSrc ? (
                <img
                  className="homeShelfCoverImage"
                  src={coverSrc}
                  alt=""
                  title={book.title}
                  loading="lazy"
                  onError={() => setBrokenCoverIds((current) => new Set(current).add(bookId))}
                />
              ) : <span className="homeShelfCoverPlaceholder">No cover</span>}
            </span>
          );
        }) : (
          <span className="homeShelfCover homeShelfCoverEmpty">
            <span className="homeShelfCoverPlaceholder">No books</span>
          </span>
        )}
      </span>
      <span className="homeShelfCardText">
        <span className="homeShelfName">{shelf.name}</span>
        {ownerLabel ? <span className="homeShelfOwner">{ownerLabel}</span> : null}
        <span className="homeShelfCount">{count} {count === 1 ? "book" : "books"}</span>
      </span>
    </a>
  );
}

function getShelfOwnerLabel(shelf: Shelf): string | null {
  if (shelf.owner_type === "group") return shelf.owner_group?.name || null;
  const fullName = [shelf.owner_user?.first_name, shelf.owner_user?.last_name].filter(Boolean).join(" ");
  return fullName || shelf.owner_user?.username || null;
}
