import type { Shelf } from "@secondpass/client";
import { InlineMeta } from "../../components/MetaSeparator";
import { MaterialIcon } from "../../components/MaterialIcon";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function formatShelfVisibility(visibility: Shelf["visibility"]): string {
  return visibility === "listed" ? "Public" : "Private";
}

export function canEditShelf(shelf: Shelf | null | undefined): boolean {
  return shelf?.can_edit === true;
}

export function formatUserDisplayName(user: Shelf["owner_user"]): string {
  const first = asString(user?.first_name) ?? "";
  const last = asString(user?.last_name) ?? "";
  return [first, last].filter(Boolean).join(" ");
}

export function formatUserHandle(user: Shelf["owner_user"]): string {
  const username = asString(user?.username);
  return username ? `<@${username}>` : "";
}

function groupOwnerName(shelf: Shelf): string {
  return (
    asString(shelf.owner_group?.name) ??
    asString((shelf.owner_group as any)?.display_name) ??
    (shelf.owner_group?.id !== undefined ? String(shelf.owner_group.id) : "Group shelf")
  );
}

export function formatShelfOwnerParts(shelf: Shelf): { kind: "user"; displayName: string; handle: string } | { kind: "group"; name: string } {
  if (shelf.owner_type === "group") {
    return { kind: "group", name: groupOwnerName(shelf) };
  }
  return {
    kind: "user",
    displayName: formatUserDisplayName(shelf.owner_user),
    handle: formatUserHandle(shelf.owner_user) || "Unknown user",
  };
}

export function ShelfMetaLine({ shelf }: { shelf: Shelf }) {
  const secondary = [formatShelfVisibility(shelf.visibility), `${(shelf.item_count ?? 0).toString()} items`];
  const ownerParts = formatShelfOwnerParts(shelf);

  if (ownerParts.kind === "group") {
    const owner = (
      <span className="shelfOwnerChip shelfOwnerGroupChip">
        <MaterialIcon name="groups" />
        <span className="shelfOwnerGroupName">{ownerParts.name}</span>
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
      {ownerParts.displayName ? <span>{ownerParts.displayName}</span> : null}
      <span className="shelfOwnerHandle">{ownerParts.handle}</span>
    </span>
  );
  return (
    <span className="shelfMetaLine">
      <InlineMeta items={[owner, ...secondary]} />
    </span>
  );
}
