import { useState } from "react";
import type { Shelf } from "@secondpass/client";
import { MaterialIcon } from "../../components/MaterialIcon";
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
  const owner = getShelfOwner(shelf);
  const accessibleOwner = owner ? `, ${owner.kind} ${owner.label}` : "";

  return (
    <a
      className="homeShelfCard"
      aria-label={`Open shelf ${shelf.name}${accessibleOwner}, ${count} ${count === 1 ? "book" : "books"}`}
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
        <span className="homeShelfMetadata">
          {owner ? (
            <>
              <MaterialIcon name={owner.kind === "group" ? "groups" : "person"} />
              <span className="homeShelfOwner">{owner.label}</span>
              <span aria-hidden="true">{"\u00b7"}</span>
            </>
          ) : null}
          <span>{count} {count === 1 ? "book" : "books"}</span>
        </span>
      </span>
    </a>
  );
}

function getShelfOwner(shelf: Shelf): { kind: "group" | "user"; label: string } | null {
  if (shelf.owner_type === "group") {
    const label = asDisplayString(shelf.owner_group?.name) || asDisplayString(shelf.owner_group?.display_name);
    return label ? { kind: "group", label } : null;
  }
  if (shelf.owner_type !== "user") return null;
  const displayName = asDisplayString(shelf.owner_user?.display_name);
  const fullName = [asDisplayString(shelf.owner_user?.first_name), asDisplayString(shelf.owner_user?.last_name)].filter(Boolean).join(" ");
  const label = displayName || fullName || asDisplayString(shelf.owner_user?.username);
  return label ? { kind: "user", label } : null;
}

function asDisplayString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
