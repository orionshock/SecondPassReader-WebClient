import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { routeToHash } from "../app/AppNavigation.Router";
import { HomePage } from "../features/home/HomePage";
import { getHomeLibrarySearchRoute } from "../features/home/homeLibrarySearch";
import type { ConnectionProfile } from "../storage/connectionProfiles";

describe("Home library search", () => {
  it("does nothing for a blank query", () => {
    expect(getHomeLibrarySearchRoute("   ")).toBeNull();
  });

  it("routes a nonblank query to All Library Books global search", () => {
    const route = getHomeLibrarySearchRoute("  space & time  ");
    expect(route).toEqual({ kind: "library", browse: "books", q: "space & time", searchMode: "global" });
    expect(route && routeToHash(route)).toBe("#/library?q=space+%26+time&search=global");
  });

  it("renders the requested copy without BookVerse", () => {
    const profile = {
      id: "p1",
      label: "Server",
      serverBaseUrl: "https://example.test",
      accessToken: "secret",
      verifiedAt: "2026-08-04T00:00:00Z",
      createdAt: "2026-08-04T00:00:00Z",
    } satisfies ConnectionProfile;
    const html = renderToStaticMarkup(createElement(HomePage, { profile, spl: null }));
    expect(html).toContain("Search the library");
    expect(html).toContain("Search books, authors, series, publishers...");
    expect(html).not.toContain("BookVerse");
  });
});
