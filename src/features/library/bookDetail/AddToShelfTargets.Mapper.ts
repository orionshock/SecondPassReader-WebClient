import type { Shelf } from "@secondpass/client";

export type PersonalShelfTarget = Shelf & { added: boolean };

export function getPersonalShelfTargets(shelves: Shelf[], addedShelfIds: ReadonlySet<string>): PersonalShelfTarget[] {
  return shelves
    .filter((shelf) => shelf.owner_type === "user" && shelf.can_edit === true)
    .map((shelf) => ({ ...shelf, added: addedShelfIds.has(String(shelf.id)) }));
}
