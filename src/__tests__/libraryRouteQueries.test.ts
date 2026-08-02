import { describe, expect, it, vi } from "vitest";
import type { SecondPassClient } from "@secondpass/client";
import { buildLibraryBooksQuery, buildLibraryEntityQuery } from "../features/library/data/libraryAxisQueries";
import { loadLibraryBooks } from "../features/library/data/libraryBookRequests";
import { deriveLibraryRouteState, type DerivedLibraryRouteState } from "../features/library/route/libraryRouteState";

describe("Library route state", () => {
  it("forces search to Books results", () => {
    const state = deriveLibraryRouteState({ browse: "authors", q: "  space opera  ", ordering: "name" }, true);
    expect(state).toMatchObject({ axis: "books", resultKind: "books", q: "space opera", ordering: "title" });
  });

  it("turns selected author and series routes into Books results", () => {
    expect(deriveLibraryRouteState({ browse: "authors", authorId: "a1", ordering: "author" }, true))
      .toMatchObject({ axis: "authors", resultKind: "books", selectedAuthorId: "a1", ordering: "author" });
    expect(deriveLibraryRouteState({ browse: "series", seriesId: "s1" }, true))
      .toMatchObject({ axis: "series", resultKind: "books", selectedSeriesId: "s1", ordering: "series_index" });
  });

  it("removes disabled group scope and falls back invalid ordering by result kind", () => {
    expect(deriveLibraryRouteState({ browse: "series", groupId: "g1", ordering: "bogus" }, false))
      .toMatchObject({ resultKind: "series", effectiveGroupId: undefined, ordering: "name" });
    expect(deriveLibraryRouteState({ browse: "books", ordering: "bogus" }, true).ordering).toBe("title");
  });
});

describe("Library axis queries", () => {
  const booksState: DerivedLibraryRouteState = {
    axis: "books",
    resultKind: "books",
    effectiveGroupId: "g1",
    q: "query",
    tag: "award-winner",
    page: 3,
    pageSize: 50,
    ordering: "series_index",
    selectedAuthorId: "a1",
    selectedSeriesId: "s1",
  };

  it("builds the complete Books query shared by global and group endpoints", () => {
    expect(buildLibraryBooksQuery(booksState)).toEqual({
      q: "query",
      author: "a1",
      series: "s1",
      tag: "award-winner",
      ordering: "series_index",
      page: 3,
      pageSize: 50,
    });
  });

  it("builds Authors and Series list query controls with a tag slug", () => {
    const entityState: DerivedLibraryRouteState = {
      ...booksState,
      axis: "authors",
      resultKind: "authors",
      ordering: "-book_count",
    };
    expect(buildLibraryEntityQuery(entityState)).toEqual({
      q: "query",
      tag: "award-winner",
      ordering: "-book_count",
      page: 3,
      pageSize: 50,
    });
  });

  it("uses broad search globally and the group books endpoint within a group", async () => {
    const emptyPage = { count: 0, next: null, previous: null, results: [] };
    const search = vi.fn().mockResolvedValue(emptyPage);
    const list = vi.fn().mockResolvedValue(emptyPage);
    const groupBooks = vi.fn().mockResolvedValue(emptyPage);
    const spl = { library: { search, books: { list }, groups: { books: groupBooks } } } as unknown as SecondPassClient;

    await loadLibraryBooks(spl, undefined, { q: "space", ordering: "author", page: 2, pageSize: 40 });
    expect(search).toHaveBeenCalledWith({ q: "space", ordering: "author", page: 2, pageSize: 40 });
    expect(list).not.toHaveBeenCalled();

    await loadLibraryBooks(spl, "g1", { q: "space", tag: "classic", ordering: "title", page: 1, pageSize: 20 });
    expect(groupBooks).toHaveBeenCalledWith("g1", { q: "space", tag: "classic", ordering: "title", page: 1, pageSize: 20 });
  });

  it("keeps tag-filtered global browsing on the books list endpoint", async () => {
    const emptyPage = { count: 0, next: null, previous: null, results: [] };
    const search = vi.fn().mockResolvedValue(emptyPage);
    const list = vi.fn().mockResolvedValue(emptyPage);
    const spl = { library: { search, books: { list }, groups: { books: vi.fn() } } } as unknown as SecondPassClient;

    const params = { q: "space", tag: "classic", ordering: "title" as const, page: 1, pageSize: 20 };
    await loadLibraryBooks(spl, undefined, params);
    expect(list).toHaveBeenCalledWith(params);
    expect(search).not.toHaveBeenCalled();
  });
});
