import { describe, expect, it } from "vitest";
import { routeToHash } from "../../app/AppNavigation.Router";
import {
  getLibraryTransitionSource,
  startLibraryGlobalSearch,
  transitionLibraryRoute,
  type LibraryRoute,
  type LibraryRouteTransition,
} from "../../app/routes/AppLibraryRoute.Policy";

describe("Library route transition policy", () => {
  it("commits search while preserving scope and resetting the previous result set", () => {
    const next = transitionLibraryRoute(route({
      browse: "authors",
      authorId: "author-1",
      groupId: "group-1",
      tag: "classic",
      view: "list",
      ordering: "-book_count",
      page: 4,
      pageSize: 50,
      bookId: "book-1",
      searchMode: "axis",
    }), { type: "commit-search", query: "  space opera  " });

    expect(next).toEqual({
      kind: "library",
      browse: "authors",
      q: "space opera",
      searchMode: "axis",
      groupId: "group-1",
      tag: "classic",
      ordering: "name",
      page: 1,
      pageSize: 50,
      bookId: "book-1",
    });
  });

  it("clears search and restores the current axis without retaining entity or view state", () => {
    const next = transitionLibraryRoute(route({
      browse: "series",
      q: "space",
      searchMode: "axis",
      seriesId: "ignored-during-search",
      groupId: "group-1",
      tag: "classic",
      view: "grid",
      ordering: "-book_count",
      page: 3,
      pageSize: 100,
      bookId: "book-1",
    }), { type: "commit-search", query: " " });

    expect(next).toEqual({
      kind: "library",
      browse: "series",
      groupId: "group-1",
      tag: "classic",
      ordering: "name",
      page: 1,
      pageSize: 100,
      bookId: "book-1",
    });
  });

  it.each([
    ["books", "title"],
    ["authors", "name"],
    ["series", "name"],
  ] as const)("selects the %s axis and clears incompatible result state", (axis, ordering) => {
    const next = transitionLibraryRoute(fullRoute(), { type: "select-axis", axis });

    expect(next).toEqual({
      kind: "library",
      browse: axis,
      groupId: "group-1",
      tag: "classic",
      ordering,
      page: 1,
      pageSize: 50,
      bookId: "book-1",
    });
  });

  it.each([
    [{ type: "author", id: "author-2" }, "authors", "authorId", "title"],
    [{ type: "series", id: "series-2" }, "series", "seriesId", "series_index"],
  ] as const)("selects a $browse entity while preserving Library scope", (entity, browse, idField, ordering) => {
    const next = transitionLibraryRoute(fullRoute(), { type: "select-entity", entity });

    expect(next).toMatchObject({
      kind: "library",
      browse,
      [idField]: entity.id,
      groupId: "group-1",
      tag: "classic",
      ordering,
      page: 1,
      pageSize: 50,
      bookId: "book-1",
    });
    expect(next).not.toHaveProperty(entity.type === "author" ? "seriesId" : "authorId");
    expect(next).not.toHaveProperty("q");
    expect(next).not.toHaveProperty("view");
  });

  it("changes Group scope by clearing tag and resetting only pagination", () => {
    const next = transitionLibraryRoute(fullRoute(), { type: "select-group", groupId: "group-2" });

    expect(next).toEqual({
      ...fullRoute(),
      groupId: "group-2",
      page: 1,
      tag: undefined,
    });
  });

  it("removes a disabled Group without resetting the current result", () => {
    const current = fullRoute();
    const { groupId: _groupId, ...expected } = current;
    expect(transitionLibraryRoute(current, { type: "remove-unavailable-group" })).toEqual(expected);
  });

  it("selects a tag by clearing global search mode and resetting the page", () => {
    const current = route({
      browse: "books",
      q: "space",
      searchMode: "global",
      groupId: "group-1",
      ordering: "author",
      page: 4,
      pageSize: 50,
      bookId: "book-1",
    });
    expect(transitionLibraryRoute(current, { type: "select-tag", tag: "classic" })).toEqual({
      ...current,
      searchMode: undefined,
      tag: "classic",
      page: 1,
    });
  });

  it("clears a tag while preserving the remaining search and result context", () => {
    const current = fullRoute();
    expect(transitionLibraryRoute(current, { type: "select-tag", tag: undefined })).toEqual({
      ...current,
      tag: undefined,
      page: 1,
    });
  });

  it.each([
    [{ type: "change-ordering", ordering: "author" }, { ordering: "author", page: 1, pageSize: 50 }],
    [{ type: "change-page-size", pageSize: 100 }, { ordering: "series", page: 1, pageSize: 100 }],
    [{ type: "change-page", page: 7 }, { ordering: "series", page: 7, pageSize: 50 }],
  ] as Array<[LibraryRouteTransition, Partial<LibraryRoute>]>)
  ("changes pagination controls without dropping Library context", (transition, changed) => {
    const current = fullRoute();
    expect(transitionLibraryRoute(current, transition)).toEqual({ ...current, ...changed });
  });

  it("opens and closes Book Detail without changing its underlying Library route", () => {
    const current = route({
      browse: "series",
      seriesId: "series-1",
      groupId: "group-1",
      tag: "classic",
      ordering: "series_index",
      page: 3,
      pageSize: 50,
      view: "grid",
    });
    const opened = transitionLibraryRoute(current, { type: "open-book-detail", bookId: " book-1 " });

    expect(opened).toEqual({ ...current, bookId: "book-1" });
    expect(transitionLibraryRoute(opened, { type: "close-book-detail" })).toEqual(current);
  });

  it.each([
    [{ type: "author", id: "author-2" }, { browse: "authors", authorId: "author-2", ordering: "title" }],
    [{ type: "series", id: "series-2" }, { browse: "series", seriesId: "series-2", ordering: "series_index" }],
    [{ type: "tag", tag: "modern" }, { browse: "books", tag: "modern", ordering: "title" }],
  ] as const)("follows a Book Detail link and closes modal state", (destination, expected) => {
    const next = transitionLibraryRoute(fullRoute(), { type: "follow-book-detail-link", destination });

    expect(next).toMatchObject({
      kind: "library",
      groupId: "group-1",
      page: 1,
      pageSize: 50,
      ...expected,
    });
    expect(next).not.toHaveProperty("bookId");
    expect(next).not.toHaveProperty("q");
    expect(next).not.toHaveProperty("view");
  });

  it("uses an empty Library context for Book Detail links opened outside Library", () => {
    const source = getLibraryTransitionSource({ kind: "home", bookId: "book-1" });
    expect(transitionLibraryRoute(source, {
      type: "follow-book-detail-link",
      destination: { type: "series", id: "series-1" },
    })).toEqual({
      kind: "library",
      browse: "series",
      seriesId: "series-1",
      ordering: "series_index",
      page: 1,
      pageSize: 20,
    });
  });

  it("keeps Home global search and transition results compatible with router serialization", () => {
    const globalSearch = startLibraryGlobalSearch("  space & time  ");
    expect(globalSearch && routeToHash(globalSearch)).toBe("#/library?q=space+%26+time&search=global");

    const paged = transitionLibraryRoute(route({ browse: "books", ordering: "title" }), {
      type: "change-page",
      page: 3,
    });
    expect(routeToHash(paged)).toBe("#/library?page=3");
  });
});

function route(fields: Omit<LibraryRoute, "kind"> = {}): LibraryRoute {
  return { kind: "library", ...fields };
}

function fullRoute(): LibraryRoute {
  return route({
    q: "space",
    searchMode: "axis",
    browse: "books",
    seriesId: "series-1",
    authorId: "author-1",
    groupId: "group-1",
    tag: "classic",
    view: "grid",
    ordering: "series",
    page: 4,
    pageSize: 50,
    bookId: "book-1",
  });
}
