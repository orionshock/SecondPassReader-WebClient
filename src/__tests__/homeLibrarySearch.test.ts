import { describe, expect, it } from "vitest";
import { routeToHash } from "../app/AppNavigation.Router";
import { getHomeLibrarySearchRoute } from "../features/home/HomeLibrarySearch.Router";

describe("Home library search", () => {
  it("does nothing for a blank query", () => {
    expect(getHomeLibrarySearchRoute("   ")).toBeNull();
  });

  it("routes a nonblank query to All Library Books global search", () => {
    const route = getHomeLibrarySearchRoute("  space & time  ");
    expect(route).toEqual({ kind: "library", browse: "books", q: "space & time", searchMode: "global" });
    expect(route && routeToHash(route)).toBe("#/library?q=space+%26+time&search=global");
  });
});
