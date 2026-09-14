import { describe, expect, it } from "vitest";
import { routeToHash } from "../../app/AppNavigation.Router";
import { startLibraryGlobalSearch } from "../../app/routes/AppLibraryRoute.Policy";

describe("Home library search", () => {
  it("does nothing for a blank query", () => {
    expect(startLibraryGlobalSearch("   ")).toBeNull();
  });

  it("routes a nonblank query to All Library Books global search", () => {
    const route = startLibraryGlobalSearch("  space & time  ");
    expect(route).toEqual({ kind: "library", browse: "books", q: "space & time", searchMode: "global" });
    expect(route && routeToHash(route)).toBe("#/library?q=space+%26+time&search=global");
  });
});
