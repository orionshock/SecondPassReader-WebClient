import { afterEach, describe, expect, it, vi } from "vitest";

import { parseCurrentRoute, routeToHash } from "../app/navigation";

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
});
