import { describe, expect, it, vi } from "vitest";
import type { SecondPassClient } from "@secondpass/client";
import { buildLibraryBooksQuery, buildLibraryEntityQuery } from "../features/library/data/LibraryAxis.Queries";
import { loadLibraryBooks } from "../features/library/data/LibraryBooks.Queries";
import { loadLibraryAuthors, loadLibrarySeries } from "../features/library/data/LibraryEntities.Queries";
import { deriveLibraryRouteState, type DerivedLibraryRouteState } from "../features/library/route/LibraryRoute.State";

describe("Library route state", () => {
  it("keeps axis searches on their selected axis", () => {
    const state = deriveLibraryRouteState({ browse: "authors", q: "  space opera  ", ordering: "name" }, true);
    expect(state).toMatchObject({ axis: "authors", resultKind: "authors", q: "space opera", searchMode: "axis", ordering: "name" });
    expect(deriveLibraryRouteState({ browse: "series", q: "space" }, true))
      .toMatchObject({ axis: "series", resultKind: "series", searchMode: "axis" });
  });

  it("allows broad search for nonblank Books routes in global or Group scope", () => {
    expect(deriveLibraryRouteState({ browse: "books", q: "space", searchMode: "global" }, true))
      .toMatchObject({ axis: "books", resultKind: "books", searchMode: "global" });
    expect(deriveLibraryRouteState({ browse: "books", q: "space", groupId: "g1", searchMode: "global" }, true))
      .toMatchObject({ axis: "books", resultKind: "books", effectiveGroupId: "g1", searchMode: "global" });
    expect(deriveLibraryRouteState({ browse: "authors", q: "space", searchMode: "global" }, true).searchMode).toBe("axis");
    expect(deriveLibraryRouteState({ browse: "books", searchMode: "global" }, true).searchMode).toBe("axis");
    expect(deriveLibraryRouteState({ browse: "books", q: "space", tag: "classic", searchMode: "global" }, true).searchMode).toBe("axis");
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
    searchMode: "axis",
    tag: "award-winner",
    page: 3,
    pageSize: 50,
    ordering: "series_index",
    selectedAuthorId: "a1",
    selectedSeriesId: "s1",
  };

  it("builds the complete Books query", () => {
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

  it("uses title-filter browse for axis search and the resolved scope endpoint for broad search", async () => {
    const emptyPage = { count: 0, next: null, previous: null, results: [] };
    const search = vi.fn().mockResolvedValue(emptyPage);
    const groupSearch = vi.fn().mockResolvedValue(emptyPage);
    const list = vi.fn().mockResolvedValue(emptyPage);
    const groupBooks = vi.fn().mockResolvedValue(emptyPage);
    const spl = { library: { search, books: { list }, groups: { books: groupBooks, search: groupSearch } } } as unknown as SecondPassClient;

    const params = { q: "space", ordering: "author" as const, page: 2, pageSize: 40 };
    await loadLibraryBooks(spl, undefined, params, "axis");
    expect(list).toHaveBeenCalledWith(params);
    expect(search).not.toHaveBeenCalled();

    await loadLibraryBooks(spl, undefined, params, "global");
    expect(search).toHaveBeenCalledWith({ q: "space", ordering: "author", page: 2, pageSize: 40 });

    await loadLibraryBooks(spl, "g1", params, "global");
    expect(groupSearch).toHaveBeenCalledWith("g1", { q: "space", ordering: "author", page: 2, pageSize: 40 });

    const groupBrowseParams = { q: "space", tag: "classic", ordering: "title" as const, page: 1, pageSize: 20 };
    await loadLibraryBooks(spl, "g1", groupBrowseParams, "axis");
    expect(groupBooks).toHaveBeenCalledWith("g1", groupBrowseParams);
  });

  it("does not send unsupported ordering to broad search", async () => {
    const emptyPage = { count: 0, next: null, previous: null, results: [] };
    const search = vi.fn().mockResolvedValue(emptyPage);
    const spl = { library: { search, books: { list: vi.fn() }, groups: { books: vi.fn(), search: vi.fn() } } } as unknown as SecondPassClient;

    await loadLibraryBooks(spl, undefined, { q: "space", ordering: "publisher", page: 1, pageSize: 20 }, "global");
    expect(search).toHaveBeenCalledWith({ q: "space", ordering: "title", page: 1, pageSize: 20 });
  });

  it("keeps tag-filtered global browsing on the books list endpoint", async () => {
    const emptyPage = { count: 0, next: null, previous: null, results: [] };
    const search = vi.fn().mockResolvedValue(emptyPage);
    const list = vi.fn().mockResolvedValue(emptyPage);
    const spl = { library: { search, books: { list }, groups: { books: vi.fn(), search: vi.fn() } } } as unknown as SecondPassClient;

    const params = { q: "space", tag: "classic", ordering: "title" as const, page: 1, pageSize: 20 };
    await loadLibraryBooks(spl, undefined, params, "axis");
    expect(list).toHaveBeenCalledWith(params);
    expect(search).not.toHaveBeenCalled();
  });

  it("uses axis-specific author and series endpoints", async () => {
    const emptyPage = { count: 0, next: null, previous: null, results: [] };
    const authorList = vi.fn().mockResolvedValue(emptyPage);
    const seriesList = vi.fn().mockResolvedValue(emptyPage);
    const groupAuthors = vi.fn().mockResolvedValue(emptyPage);
    const groupSeries = vi.fn().mockResolvedValue(emptyPage);
    const spl = { library: {
      authors: { list: authorList },
      series: { list: seriesList },
      groups: { authors: groupAuthors, series: groupSeries },
    } } as unknown as SecondPassClient;
    const params = { q: "space", ordering: "name" as const, page: 1, pageSize: 20 };

    await loadLibraryAuthors(spl, undefined, params);
    await loadLibrarySeries(spl, undefined, params);
    await loadLibraryAuthors(spl, "g1", params);
    await loadLibrarySeries(spl, "g1", params);

    const expected = { ...params, includePreviewBooks: true };
    expect(authorList).toHaveBeenCalledWith(expected);
    expect(seriesList).toHaveBeenCalledWith(expected);
    expect(groupAuthors).toHaveBeenCalledWith("g1", expected);
    expect(groupSeries).toHaveBeenCalledWith("g1", expected);
  });
});
