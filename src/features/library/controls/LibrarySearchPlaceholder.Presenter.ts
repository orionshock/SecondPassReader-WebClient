import type { LibraryAxis, LibrarySearchMode } from "../route/LibraryRoute.State";

type Input = {
  axis: LibraryAxis;
  scopeName?: string;
  searchMode: LibrarySearchMode;
};

export function getLibrarySearchPlaceholder({ axis, scopeName, searchMode }: Input): string {
  if (searchMode === "global") return "Search books, authors, series, publishers...";

  const target = axis === "authors" ? "authors" : axis === "series" ? "series" : "books";
  return scopeName ? `Search ${target} in ${scopeName}...` : `Search ${target}...`;
}
