import type { Shelf } from "@secondpass/client";
import { InlineMeta } from "../../components/Metadata.UI";
import { MaterialIcon } from "../../components/MaterialIcon.UI";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function formatShelfVisibility(visibility: Shelf["visibility"]): string {
  return visibility === "listed" ? "Public" : "Private";
}

export function canEditShelf(shelf: Shelf | null | undefined): boolean {
  return shelf?.owner_type === "user" && shelf.can_edit === true;
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
  return asString(shelf.owner_group?.name) ?? "Group shelf";
}

export function isCanonicalPublicShelfGroup(shelf: Shelf): boolean {
  return shelf.owner_type === "group" && shelf.owner_group?.is_public_group === true;
}

export function formatShelfOwnerParts(shelf: Shelf): { kind: "user"; displayName: string; handle: string } | { kind: "group"; name: string; isPublicGroup: boolean } {
  if (shelf.owner_type === "group") {
    return {
      kind: "group",
      name: groupOwnerName(shelf),
      isPublicGroup: isCanonicalPublicShelfGroup(shelf),
    };
  }
  return {
    kind: "user",
    displayName: formatUserDisplayName(shelf.owner_user),
    handle: formatUserHandle(shelf.owner_user) || "Unknown account",
  };
}

export function ShelfMetaLine({ shelf, showOwner = true }: { shelf: Shelf; showOwner?: boolean }) {
  const itemCount = shelf.item_count ?? 0;
  const secondary = [formatShelfVisibility(shelf.visibility), `${itemCount} ${itemCount === 1 ? "book" : "books"}`];
  if (!showOwner) return <span className="shelfMetaLine"><InlineMeta items={secondary} /></span>;
  const ownerParts = formatShelfOwnerParts(shelf);

  if (ownerParts.kind === "group") {
    const owner = (
      <span className={`shelfOwnerChip shelfOwnerGroupChip${ownerParts.isPublicGroup ? " shelfOwnerGroupChipPublic" : ""}`}>
        <MaterialIcon name={ownerParts.isPublicGroup ? "public" : "groups"} />
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
