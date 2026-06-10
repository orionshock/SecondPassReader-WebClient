import type { Shelf } from "@secondpass/client";
import { InlineMeta } from "../../components/MetaSeparator";
import { MaterialIcon } from "../../components/MaterialIcon";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function formatShelfVisibility(visibility: Shelf["visibility"]): string {
  return visibility === "listed" ? "Public" : "Private";
}

function userOwnerName(shelf: Shelf): string {
  return (
    asString(shelf.owner_user?.username) ??
    asString((shelf.owner_user as any)?.display_name) ??
    asString((shelf.owner_user as any)?.name) ??
    "Unknown user"
  );
}

function groupOwnerName(shelf: Shelf): string {
  return (
    asString(shelf.owner_group?.name) ??
    asString((shelf.owner_group as any)?.display_name) ??
    (shelf.owner_group?.id !== undefined ? String(shelf.owner_group.id) : "Group shelf")
  );
}

export function ShelfMetaLine({ shelf }: { shelf: Shelf }) {
  const secondary = [formatShelfVisibility(shelf.visibility), `${(shelf.item_count ?? 0).toString()} items`];

  if (shelf.owner_type === "group") {
    const owner = (
      <span className="shelfOwnerChip">
        <MaterialIcon name="groups" />
        {groupOwnerName(shelf)}
      </span>
    );
    return (
      <span className="shelfMetaLine">
        <InlineMeta items={[owner, ...secondary]} />
      </span>
    );
  }

  const owner = (
    <span className="shelfOwnerInline">
      <MaterialIcon name="person" />
      {userOwnerName(shelf)}
    </span>
  );
  return (
    <span className="shelfMetaLine">
      <InlineMeta items={[owner, ...secondary]} />
    </span>
  );
}
