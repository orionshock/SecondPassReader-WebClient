import { afterEach, describe, expect, it, vi } from "vitest";

import { parseCurrentRoute, routeToHash } from "../app/navigation";

describe("navigation route ordering params", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds library browse ordering, page, and page size params", () => {
    expect(routeToHash({
      kind: "library",
      browse: "series",
      seriesId: "s1",
      ordering: "series_index",
      page: 2,
      pageSize: 50,
    })).toBe("#/library?browse=series&series=s1&ordering=series_index&page=2&page_size=50");
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
