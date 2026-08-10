import { describe, expect, it } from "vitest";
import type { Shelf } from "@secondpass/client";
import { getPersonalShelfTargets } from "../features/library/bookDetail/AddToShelfTargets.Mapper";

const shelf = (id: string, ownerType: string, canEdit: boolean): Shelf => ({
  id,
  name: id,
  owner_type: ownerType,
  can_edit: canEdit,
});

describe("getPersonalShelfTargets", () => {
  it("keeps only editable user-owned shelves and marks existing membership", () => {
    const targets = getPersonalShelfTargets([
      shelf("personal-added", "user", true),
      shelf("personal-open", "user", true),
      shelf("read-only", "user", false),
      shelf("group-editable", "group", true),
    ], new Set(["personal-added", "group-editable"]));

    expect(targets.map(({ id, added }) => ({ id, added }))).toEqual([
      { id: "personal-added", added: true },
      { id: "personal-open", added: false },
    ]);
  });
});
