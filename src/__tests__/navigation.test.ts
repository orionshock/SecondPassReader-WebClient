import { afterEach, describe, expect, it, vi } from "vitest";

import { parseCurrentRoute, routeToHash } from "../app/AppNavigation.Router";

describe("navigation route ordering params", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("omits default library browse params", () => {
    expect(routeToHash({
      kind: "library",
      browse: "books",
      ordering: "title",
      page: 1,
      pageSize: 20,
    })).toBe("#/library");

    expect(routeToHash({
      kind: "library",
      browse: "series",
      ordering: "name",
      page: 1,
      pageSize: 20,
    })).toBe("#/library?browse=series");

    expect(routeToHash({
      kind: "library",
      browse: "series",
      seriesId: "s1",
      ordering: "series_index",
      page: 1,
      pageSize: 20,
    })).toBe("#/library?browse=series&series=s1");

    expect(routeToHash({
      kind: "library",
      browse: "authors",
      authorId: "a1",
      ordering: "title",
      page: 1,
      pageSize: 20,
    })).toBe("#/library?browse=authors&author=a1");

    expect(routeToHash({
      kind: "library",
      browse: "books",
      groupId: "g1",
      ordering: "title",
      page: 1,
      pageSize: 20,
    })).toBe("#/library?group=g1");
  });

  it("keeps non-default library params", () => {
    expect(routeToHash({
      kind: "library",
      browse: "books",
      ordering: "author",
    })).toBe("#/library?ordering=author");

    expect(routeToHash({
      kind: "library",
      browse: "series",
      ordering: "-book_count",
    })).toBe("#/library?browse=series&ordering=-book_count");

    expect(routeToHash({
      kind: "library",
      browse: "series",
      seriesId: "s1",
      ordering: "title",
      page: 2,
      pageSize: 50,
    })).toBe("#/library?browse=series&series=s1&ordering=title&page=2&page_size=50");
  });

  it("round trips an optional catalog tag slug without serializing an empty tag", () => {
    expect(routeToHash({
      kind: "library",
      browse: "series",
      tag: "award winner",
      ordering: "name",
      page: 1,
      pageSize: 20,
    })).toBe("#/library?browse=series&tag=award+winner");

    vi.stubGlobal("window", { location: { hash: "#/library?browse=authors&tag=classic&page=2" } });
    expect(parseCurrentRoute()).toMatchObject({ kind: "library", browse: "authors", tag: "classic", page: 2 });

    expect(routeToHash({ kind: "library", browse: "books", tag: "", page: 1 })).toBe("#/library");
  });

  it("treats group as scope independently from the library axis", () => {
    expect(routeToHash({ kind: "library", browse: "authors", groupId: "g1", ordering: "name" }))
      .toBe("#/library?browse=authors&group=g1");

    vi.stubGlobal("window", { location: { hash: "#/library?browse=groups&group=g1" } });
    expect(parseCurrentRoute()).toMatchObject({ kind: "library", browse: "books", groupId: "g1" });
  });

  it("round trips broad search in global or Group scope and normalizes invalid combinations", () => {
    const hash = routeToHash({ kind: "library", browse: "books", q: "space opera", searchMode: "global" });
    expect(hash).toBe("#/library?q=space+opera&search=global");

    vi.stubGlobal("window", { location: { hash } });
    expect(parseCurrentRoute()).toMatchObject({ kind: "library", browse: "books", q: "space opera", searchMode: "global" });

    vi.stubGlobal("window", { location: { hash: "#/library?browse=authors&q=space&search=global" } });
    expect(parseCurrentRoute()).toMatchObject({ kind: "library", browse: "authors", q: "space", searchMode: undefined });

    const groupHash = routeToHash({ kind: "library", browse: "books", q: "space", groupId: "g1", searchMode: "global" });
    expect(groupHash).toBe("#/library?q=space&search=global&group=g1");

    vi.stubGlobal("window", { location: { hash: groupHash } });
    expect(parseCurrentRoute()).toMatchObject({ kind: "library", browse: "books", q: "space", searchMode: "global", groupId: "g1" });
  });

  it("omits default shelf params and keeps non-default shelf params", () => {
    expect(routeToHash({
      kind: "shelves",
      ordering: "name",
      page: 1,
      pageSize: 20,
    })).toBe("#/shelves");

    expect(routeToHash({
      kind: "shelves",
      ordering: "-item_count",
    })).toBe("#/shelves?ordering=-item_count");

    expect(routeToHash({
      kind: "shelf",
      shelfId: "shelf-1",
      ordering: "position",
      page: 1,
      pageSize: 20,
    })).toBe("#/shelves/shelf-1");

    expect(routeToHash({
      kind: "shelf",
      shelfId: "shelf-1",
      ordering: "title",
    })).toBe("#/shelves/shelf-1?ordering=title");
  });

  it("parses library and shelf ordering params", () => {
    vi.stubGlobal("window", { location: { hash: "#/library?browse=authors&author=a1&ordering=title&page=3&page_size=100" } });
    expect(parseCurrentRoute()).toEqual({
      kind: "library",
      browse: "authors",
      authorId: "a1",
      groupId: undefined,
      tag: undefined,
      ordering: "title",
      page: 3,
      pageSize: 100,
      view: undefined,
      bookId: undefined,
    });

    vi.stubGlobal("window", { location: { hash: "#/shelves/shelf-1?ordering=author&page=2&page_size=50" } });
    expect(parseCurrentRoute()).toEqual({
      kind: "shelf",
      shelfId: "shelf-1",
      ordering: "author",
      page: 2,
      pageSize: 50,
    });
  });

  it("round trips shelf detail ordering, page, and page_size", () => {
    const hash = routeToHash({
      kind: "shelf",
      shelfId: "staff picks",
      ordering: "title",
      page: 4,
      pageSize: 100,
    });

    expect(hash).toBe("#/shelves/staff%20picks?ordering=title&page=4&page_size=100");

    vi.stubGlobal("window", { location: { hash } });
    expect(parseCurrentRoute()).toEqual({
      kind: "shelf",
      shelfId: "staff picks",
      ordering: "title",
      page: 4,
      pageSize: 100,
    });
  });

  it("preserves unknown ordering from parsed URLs but omits default serialization", () => {
    vi.stubGlobal("window", { location: { hash: "#/library?ordering=definitely-not-supported&page=0&page_size=-1" } });
    expect(parseCurrentRoute()).toEqual({
      kind: "library",
      browse: "books",
      ordering: "definitely-not-supported",
      page: undefined,
      pageSize: undefined,
      view: undefined,
    });

    expect(routeToHash({
      kind: "library",
      browse: "books",
      ordering: "title",
      page: 1,
      pageSize: 20,
    })).toBe("#/library");
  });

  it("serializes and parses settings tabs", () => {
    expect(routeToHash({ kind: "settings" })).toBe("#/settings?tab=appearance");
    expect(routeToHash({ kind: "settings", tab: "appearance" })).toBe("#/settings?tab=appearance");
    expect(routeToHash({ kind: "settings", tab: "library-server" })).toBe("#/settings?tab=library-server");
    expect(routeToHash({ kind: "settings", tab: "tools" })).toBe("#/settings?tab=tools");

    vi.stubGlobal("window", { location: { hash: "#/settings?tab=tools" } });
    expect(parseCurrentRoute()).toEqual({ kind: "settings", tab: "tools" });

    vi.stubGlobal("window", { location: { hash: "#/settings?tab=bogus" } });
    expect(parseCurrentRoute()).toEqual({ kind: "settings" });
  });
});
