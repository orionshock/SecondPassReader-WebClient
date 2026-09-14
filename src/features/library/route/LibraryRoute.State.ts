import { getEffectiveLibraryGroupId } from "../libraryScope/LibraryScope.Policy";
import { DEFAULT_APP_PAGE_SIZE } from "../../../app/AppNavigation.Constants";
import { getDefaultLibraryOrdering } from "../../../app/routes/AppLibraryRoute.Policy";

export type LibraryAxis = "books" | "authors" | "series";
export type LibraryResultKind = LibraryAxis;
export type LibrarySearchMode = "axis" | "global";
export type LibraryBookOrdering = "title" | "author" | "series" | "series_index";
export type LibraryEntityOrdering = "name" | "-book_count";
export type LibraryOrdering = LibraryBookOrdering | LibraryEntityOrdering;

export type LibraryRouteInput = {
  q?: string;
  searchMode?: LibrarySearchMode;
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
  searchMode: LibrarySearchMode;
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
  const axis: LibraryAxis = route.browse === "authors" || route.browse === "series" ? route.browse : "books";
  const effectiveGroupId = getEffectiveLibraryGroupId(route.groupId, advancedLibraryGroupsEnabled);
  const searchMode: LibrarySearchMode = route.searchMode === "global" && q && axis === "books"
    ? "global"
    : "axis";
  const selectedAuthorId = !q && axis === "authors" ? route.authorId?.trim() || undefined : undefined;
  const selectedSeriesId = !q && axis === "series" ? route.seriesId?.trim() || undefined : undefined;
  const resultKind: LibraryResultKind = axis === "books" || selectedAuthorId || selectedSeriesId ? "books" : axis;

  let ordering: LibraryOrdering;
  if (resultKind === "books") {
    const allowed = selectedSeriesId ? SERIES_BOOK_ORDERINGS : BOOK_ORDERINGS;
    const fallback = getDefaultLibraryOrdering({
      browse: axis,
      seriesId: selectedSeriesId,
      authorId: selectedAuthorId,
    }) as LibraryBookOrdering;
    ordering = allowed.has(route.ordering as LibraryBookOrdering) ? route.ordering as LibraryBookOrdering : fallback;
  } else {
    ordering = ENTITY_ORDERINGS.has(route.ordering as LibraryEntityOrdering)
      ? route.ordering as LibraryEntityOrdering
      : getDefaultLibraryOrdering({ browse: axis }) as LibraryEntityOrdering;
  }

  return {
    axis,
    resultKind,
    effectiveGroupId,
    q,
    searchMode,
    tag: route.tag?.trim() || undefined,
    page: Number.isInteger(route.page) && (route.page ?? 0) > 0 ? route.page! : 1,
    pageSize: Number.isInteger(route.pageSize) && (route.pageSize ?? 0) > 0 ? route.pageSize! : DEFAULT_APP_PAGE_SIZE,
    ordering,
    selectedAuthorId,
    selectedSeriesId,
  };
}
