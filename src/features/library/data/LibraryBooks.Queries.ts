import type {
  CompactBook,
  LibraryBookListParams,
  LibrarySearchParams,
  PaginatedResponse,
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
): Promise<PaginatedResponse<CompactBook>> {
  if (groupId) return spl.library.groups.books(groupId, params);
  if (searchMode === "global" && params.q?.trim() && !params.tag && !params.author && !params.series) {
    const ordering = GLOBAL_SEARCH_ORDERINGS.has(params.ordering as NonNullable<LibrarySearchParams["ordering"]>)
      ? params.ordering as LibrarySearchParams["ordering"]
      : "title";
    return spl.library.search({
      q: params.q,
      ordering,
      page: params.page,
      pageSize: params.pageSize,
    });
  }
  return spl.library.books.list(params);
}
