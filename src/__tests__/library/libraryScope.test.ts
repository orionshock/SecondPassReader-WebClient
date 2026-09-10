import { describe, expect, it } from "vitest";
import { getEffectiveLibraryGroupId } from "../../features/library/libraryScope/LibraryScope.Policy";

describe("getEffectiveLibraryGroupId", () => {
  it("allows group scope when advanced groups are enabled", () => {
    expect(getEffectiveLibraryGroupId("group-1", true)).toBe("group-1");
  });

  it("forces All Library scope when advanced groups are disabled", () => {
    expect(getEffectiveLibraryGroupId("group-1", false)).toBeUndefined();
    expect(getEffectiveLibraryGroupId(undefined, false)).toBeUndefined();
  });
});
