import { describe, expect, it } from "vitest";
import type { Shelf } from "@secondpass/client";

import { formatShelfOwnerParts, isCanonicalPublicShelfGroup } from "../features/shelves/shelfMeta";

function makeShelf(overrides: Partial<Shelf>): Shelf {
  return {
    id: "shelf-1",
    name: "Shelf",
    owner_type: "group",
    owner_group: {
      id: "group-1",
      name: "Readers",
    },
    visibility: "private",
    ...overrides,
  };
}

describe("shelfMeta public group detection", () => {
  it("detects the canonical public group from the API flag", () => {
    const shelf = makeShelf({
      owner_group: {
        id: "group-public",
        name: "Community",
        is_public_group: true,
      },
    });

    expect(isCanonicalPublicShelfGroup(shelf)).toBe(true);
    expect(formatShelfOwnerParts(shelf)).toEqual({
      kind: "group",
      name: "Community",
      isPublicGroup: true,
    });
  });

  it("does not infer the public group from its display name", () => {
    const shelf = makeShelf({
      owner_group: {
        id: "group-ordinary",
        name: "Public",
        is_public_group: false,
      },
    });

    expect(isCanonicalPublicShelfGroup(shelf)).toBe(false);
    expect(formatShelfOwnerParts(shelf)).toEqual({
      kind: "group",
      name: "Public",
      isPublicGroup: false,
    });
  });

  it("does not confuse listed shelf visibility with public group ownership", () => {
    const shelf = makeShelf({
      visibility: "listed",
      owner_group: {
        id: "group-ordinary",
        name: "Readers",
      },
    });

    expect(isCanonicalPublicShelfGroup(shelf)).toBe(false);
  });

  it("keeps user-owned shelf metadata distinct from group ownership", () => {
    const shelf = makeShelf({
      owner_type: "user",
      owner_group: null,
      owner_user: {
        id: "u1",
        profile_id: "p1",
        username: "ada",
        first_name: "Ada",
        last_name: "Lovelace",
      },
    });

    expect(formatShelfOwnerParts(shelf)).toEqual({
      kind: "user",
      displayName: "Ada Lovelace",
      handle: "<@ada>",
    });
  });

  it("does not require advanced library groups context to expose owner group labels", () => {
    const shelf = makeShelf({
      owner_group: {
        id: "club-1",
        name: "Fantasy Club",
        is_public_group: false,
      },
    });

    expect(formatShelfOwnerParts(shelf)).toEqual({
      kind: "group",
      name: "Fantasy Club",
      isPublicGroup: false,
    });
  });
});
