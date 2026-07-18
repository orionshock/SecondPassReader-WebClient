import { getEffectiveLibraryGroupId } from "../libraryScope/libraryScope";

export type LibraryAxis = "books" | "authors" | "series";
export type LibraryResultKind = LibraryAxis;
export type LibraryBookOrdering = "title" | "author" | "series" | "series_index";
export type LibraryEntityOrdering = "name" | "-book_count";
export type LibraryOrdering = LibraryBookOrdering | LibraryEntityOrdering;

export type LibraryRouteInput = {
  q?: string;
  browse?: LibraryAxis;
  seriesId?: string;
  authorId?: string;
  groupId?: string;
  tag?: string;
  ordering?: string;
  page?: number;
  pageSize?: number;
};

export type DerivedLibraryRouteState = {
  axis: LibraryAxis;
  resultKind: LibraryResultKind;
  effectiveGroupId?: string;
  q?: string;
  tag?: string;
  page: number;
  pageSize: number;
  ordering: LibraryOrdering;
  selectedAuthorId?: string;
  selectedSeriesId?: string;
};

const BOOK_ORDERINGS = new Set<LibraryBookOrdering>(["title", "author", "series"]);
const SERIES_BOOK_ORDERINGS = new Set<LibraryBookOrdering>(["series_index", "title", "author"]);
const ENTITY_ORDERINGS = new Set<LibraryEntityOrdering>(["name", "-book_count"]);

export function deriveLibraryRouteState(
  route: LibraryRouteInput,
  advancedLibraryGroupsEnabled: boolean,
): DerivedLibraryRouteState {
  const q = route.q?.trim() || undefined;
  const requestedAxis = route.browse === "authors" || route.browse === "series" ? route.browse : "books";
  const axis: LibraryAxis = q ? "books" : requestedAxis;
  const selectedAuthorId = !q && axis === "authors" ? route.authorId?.trim() || undefined : undefined;
  const selectedSeriesId = !q && axis === "series" ? route.seriesId?.trim() || undefined : undefined;
  const resultKind: LibraryResultKind = q || axis === "books" || selectedAuthorId || selectedSeriesId ? "books" : axis;

  let ordering: LibraryOrdering;
  if (resultKind === "books") {
    const allowed = selectedSeriesId ? SERIES_BOOK_ORDERINGS : BOOK_ORDERINGS;
    const fallback: LibraryBookOrdering = selectedSeriesId ? "series_index" : "title";
    ordering = allowed.has(route.ordering as LibraryBookOrdering) ? route.ordering as LibraryBookOrdering : fallback;
  } else {
    ordering = ENTITY_ORDERINGS.has(route.ordering as LibraryEntityOrdering) ? route.ordering as LibraryEntityOrdering : "name";
  }

  return {
    axis,
    resultKind,
    effectiveGroupId: getEffectiveLibraryGroupId(route.groupId, advancedLibraryGroupsEnabled),
    q,
    tag: route.tag?.trim() || undefined,
    page: Number.isInteger(route.page) && (route.page ?? 0) > 0 ? route.page! : 1,
    pageSize: Number.isInteger(route.pageSize) && (route.pageSize ?? 0) > 0 ? route.pageSize! : 20,
    ordering,
    selectedAuthorId,
    selectedSeriesId,
  };
}
