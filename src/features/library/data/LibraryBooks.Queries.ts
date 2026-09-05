import type {
  CompactBook,
  CatalogResultPage,
  LibraryBookListParams,
  LibrarySearchParams,
  SecondPassClient,
} from "@secondpass/client";
import type { LibrarySearchMode } from "../route/LibraryRoute.State";

const GLOBAL_SEARCH_ORDERINGS = new Set<NonNullable<LibrarySearchParams["ordering"]>>([
  "title", "-title", "author", "-author", "series", "-series",
]);

export function loadLibraryBooks(
  spl: SecondPassClient,
  groupId: string | undefined,
  params: LibraryBookListParams,
  searchMode: LibrarySearchMode,
): Promise<CatalogResultPage<CompactBook>> {
  const scope = groupId
    ? {
        browse: (query: LibraryBookListParams) => spl.library.groups.books(groupId, query),
        search: (query: LibrarySearchParams) => spl.library.groups.search(groupId, query),
      }
    : {
        browse: (query: LibraryBookListParams) => spl.library.books.list(query),
        search: (query: LibrarySearchParams) => spl.library.search(query),
      };

  if (searchMode === "global" && params.q?.trim() && !params.author && !params.series) {
    const ordering = GLOBAL_SEARCH_ORDERINGS.has(params.ordering as NonNullable<LibrarySearchParams["ordering"]>)
      ? params.ordering as LibrarySearchParams["ordering"]
      : "title";
    const searchParams = {
      q: params.q,
      ...(params.tag !== undefined ? { tag: params.tag } : {}),
      ordering,
      page: params.page,
      pageSize: params.pageSize,
    };
    return scope.search(searchParams);
  }
  return scope.browse(params);
}
