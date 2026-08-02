import type {
  CompactBook,
  LibraryBookListParams,
  LibrarySearchParams,
  PaginatedResponse,
  SecondPassClient,
} from "@secondpass/client";

export function loadLibraryBooks(
  spl: SecondPassClient,
  groupId: string | undefined,
  params: LibraryBookListParams,
): Promise<PaginatedResponse<CompactBook>> {
  if (groupId) return spl.library.groups.books(groupId, params);
  if (params.q !== undefined && params.tag === undefined && params.author === undefined && params.series === undefined) {
    return spl.library.search({
      q: params.q,
      ordering: params.ordering as LibrarySearchParams["ordering"],
      page: params.page,
      pageSize: params.pageSize,
    });
  }
  return spl.library.books.list(params);
}
