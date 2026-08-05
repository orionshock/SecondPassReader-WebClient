import type { Author, LibraryEntityListParams, PaginatedResponse, SecondPassClient, Series } from "@secondpass/client";

export function loadLibraryAuthors(
  spl: SecondPassClient,
  groupId: string | undefined,
  params: LibraryEntityListParams,
): Promise<PaginatedResponse<Author>> {
  const query = { ...params, includePreviewBooks: true };
  return groupId ? spl.library.groups.authors(groupId, query) : spl.library.authors.list(query);
}

export function loadLibrarySeries(
  spl: SecondPassClient,
  groupId: string | undefined,
  params: LibraryEntityListParams,
): Promise<PaginatedResponse<Series>> {
  const query = { ...params, includePreviewBooks: true };
  return groupId ? spl.library.groups.series(groupId, query) : spl.library.series.list(query);
}
