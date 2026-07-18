import type { LibraryBookListParams, LibraryEntityListParams } from "@secondpass/client";
import type { DerivedLibraryRouteState, LibraryBookOrdering, LibraryEntityOrdering } from "../route/libraryRouteState";

export function buildLibraryBooksQuery(state: DerivedLibraryRouteState): LibraryBookListParams {
  return {
    q: state.q,
    author: state.selectedAuthorId,
    series: state.selectedSeriesId,
    tag: state.tag,
    ordering: state.ordering as LibraryBookOrdering,
    page: state.page,
    pageSize: state.pageSize,
  };
}

export function buildLibraryEntityQuery(state: DerivedLibraryRouteState): LibraryEntityListParams {
  return {
    q: state.q,
    tag: state.tag,
    ordering: state.ordering as LibraryEntityOrdering,
    page: state.page,
    pageSize: state.pageSize,
  };
}
