import type { Shelf } from "@secondpass/client";
import { MaterialIcon } from "../../components/MaterialIcon.UI";
import { PreviewBookCoverStack } from "../library/display/PreviewBookCoverStack.UI";
import { normalizePreviewBooks } from "../library/display/PreviewBooks.Mapper";

export function HomeShelfCard({
  shelf,
  baseUrl,
  href,
}: {
  shelf: Shelf;
  baseUrl?: string | null;
  href: string;
}) {
  const previews = normalizePreviewBooks(shelf.preview_books);
  const count = shelf.item_count ?? 0;
  const owner = getShelfOwner(shelf);
  const accessibleOwner = owner ? `, ${owner.kind} ${owner.label}` : "";

  return (
    <a
      className="homeShelfCard"
      aria-label={`Open shelf ${shelf.name}${accessibleOwner}, ${count} ${count === 1 ? "book" : "books"}`}
      href={href}
    >
      <PreviewBookCoverStack
        previewBooks={previews}
        maxCovers={3}
        baseUrl={baseUrl}
        variant="homeShelf"
        emptyLabel="No books"
        decorative
      />
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
