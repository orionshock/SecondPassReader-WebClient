import type { AppRoute } from "../AppNavigation.Router";
import { DEFAULT_APP_PAGE_SIZE } from "../AppNavigation.Constants";

export type LibraryRoute = Extract<AppRoute, { kind: "library" }>;
export type LibraryAxis = NonNullable<LibraryRoute["browse"]>;
export type DefaultLibraryOrdering = "title" | "name" | "series_index";

export type LibraryRouteTransition =
  | { type: "commit-search"; query: string }
  | { type: "select-axis"; axis: LibraryAxis }
  | { type: "select-entity"; entity: { type: "author" | "series"; id: string } }
  | { type: "select-group"; groupId: string | undefined }
  | { type: "remove-unavailable-group" }
  | { type: "select-tag"; tag: string | undefined }
  | { type: "change-ordering"; ordering: string }
  | { type: "change-page-size"; pageSize: number }
  | { type: "change-page"; page: number }
  | { type: "open-book-detail"; bookId: string }
  | { type: "close-book-detail" }
  | {
      type: "follow-book-detail-link";
      destination:
        | { type: "author" | "series"; id: string }
        | { type: "tag"; tag: string };
    };

export function transitionLibraryRoute(
  current: LibraryRoute,
  transition: LibraryRouteTransition,
): LibraryRoute {
  switch (transition.type) {
    case "commit-search":
      return commitSearch(current, transition.query);
    case "select-axis":
      return selectAxis(current, transition.axis);
    case "select-entity":
      return selectEntity(current, transition.entity);
    case "select-group":
      return selectGroup(current, transition.groupId);
    case "remove-unavailable-group":
      return removeUnavailableGroup(current);
    case "select-tag":
      return selectTag(current, transition.tag);
    case "change-ordering":
      return {
        ...current,
        ordering: transition.ordering,
        page: 1,
        pageSize: current.pageSize ?? DEFAULT_APP_PAGE_SIZE,
      };
    case "change-page-size":
      return { ...current, ordering: current.ordering, page: 1, pageSize: transition.pageSize };
    case "change-page":
      return {
        ...current,
        ordering: current.ordering,
        page: transition.page,
        pageSize: current.pageSize ?? DEFAULT_APP_PAGE_SIZE,
      };
    case "open-book-detail": {
      // Book Detail is modal route state; opening it must retain the exact underlying Library context.
      const bookId = transition.bookId.trim();
      return bookId ? { ...current, bookId } : current;
    }
    case "close-book-detail": {
      const { bookId: _bookId, ...underlyingRoute } = current;
      return underlyingRoute;
    }
    case "follow-book-detail-link": {
      const destination = transition.destination;
      const next = destination.type === "tag"
        ? selectBookDetailTag(current, destination.tag)
        : selectEntity(current, destination);
      return transitionLibraryRoute(next, { type: "close-book-detail" });
    }
  }
}

export function getLibraryTransitionSource(route: AppRoute | null): LibraryRoute {
  return route?.kind === "library" ? route : { kind: "library" };
}

export function startLibraryGlobalSearch(value: string): LibraryRoute | null {
  const query = value.trim();
  return query
    ? { kind: "library", browse: "books", q: query, searchMode: "global" }
    : null;
}

export function getDefaultLibraryOrdering(
  route: Pick<LibraryRoute, "browse" | "seriesId" | "authorId">,
): DefaultLibraryOrdering {
  if (route.browse === "series" && route.seriesId) return "series_index";
  if (route.browse === "series") return "name";
  if (route.browse === "authors" && route.authorId) return "title";
  if (route.browse === "authors") return "name";
  return "title";
}

function commitSearch(current: LibraryRoute, value: string): LibraryRoute {
  const query = value.trim();
  const browse = current.browse ?? "books";
  const ordering = getDefaultLibraryOrdering({ browse });
  const preserved = preserveLibraryScope(current);
  return query
    ? {
        ...preserved,
        kind: "library",
        browse,
        q: query,
        searchMode: current.searchMode,
        ordering,
        page: 1,
        pageSize: current.pageSize ?? DEFAULT_APP_PAGE_SIZE,
      }
    : {
        ...preserved,
        kind: "library",
        browse,
        ordering,
        page: 1,
        pageSize: current.pageSize ?? DEFAULT_APP_PAGE_SIZE,
      };
}

function selectAxis(current: LibraryRoute, axis: LibraryAxis): LibraryRoute {
  return {
    ...preserveLibraryScope(current),
    kind: "library",
    browse: axis,
    ordering: getDefaultLibraryOrdering({ browse: axis }),
    page: 1,
    pageSize: current.pageSize ?? DEFAULT_APP_PAGE_SIZE,
  };
}

function selectEntity(
  current: LibraryRoute,
  entity: { type: "author" | "series"; id: string },
): LibraryRoute {
  return {
    ...preserveLibraryScope(current),
    kind: "library",
    browse: entity.type === "author" ? "authors" : "series",
    ...(entity.type === "author" ? { authorId: entity.id } : { seriesId: entity.id }),
    ordering: getDefaultLibraryOrdering({
      browse: entity.type === "author" ? "authors" : "series",
      ...(entity.type === "author" ? { authorId: entity.id } : { seriesId: entity.id }),
    }),
    page: 1,
    pageSize: current.pageSize ?? DEFAULT_APP_PAGE_SIZE,
  };
}

function selectGroup(current: LibraryRoute, groupId: string | undefined): LibraryRoute {
  const { tag: _tag, ...withoutTag } = current;
  return {
    ...withoutTag,
    groupId,
    page: 1,
    pageSize: current.pageSize ?? DEFAULT_APP_PAGE_SIZE,
  };
}

function removeUnavailableGroup(current: LibraryRoute): LibraryRoute {
  const { groupId: _groupId, ...withoutGroup } = current;
  return withoutGroup;
}

function selectTag(current: LibraryRoute, tag: string | undefined): LibraryRoute {
  const { searchMode: currentSearchMode, ...withoutSearchMode } = current;
  return {
    ...(tag ? withoutSearchMode : current),
    tag,
    page: 1,
    pageSize: current.pageSize ?? DEFAULT_APP_PAGE_SIZE,
    ...(!tag && currentSearchMode ? { searchMode: currentSearchMode } : {}),
  };
}

function selectBookDetailTag(current: LibraryRoute, tag: string): LibraryRoute {
  return {
    ...preserveLibraryScope(current),
    kind: "library",
    browse: "books",
    tag,
    ordering: "title",
    page: 1,
    pageSize: current.pageSize ?? DEFAULT_APP_PAGE_SIZE,
  };
}

function preserveLibraryScope(current: LibraryRoute): LibraryRoute {
  // Result-changing transitions retain unclassified route fields until policy explicitly resets them.
  const {
    q: _q,
    searchMode: _searchMode,
    browse: _browse,
    seriesId: _seriesId,
    authorId: _authorId,
    view: _view,
    ordering: _ordering,
    page: _page,
    pageSize: _pageSize,
    ...scope
  } = current;
  return scope;
}
