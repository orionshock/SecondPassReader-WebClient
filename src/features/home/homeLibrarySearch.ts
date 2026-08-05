import type { AppRoute } from "../../app/navigation";

export const HOME_LIBRARY_SEARCH_LABEL = "Search the library";
export const HOME_LIBRARY_SEARCH_PLACEHOLDER = "Search books, authors, series, publishers...";

export function getHomeLibrarySearchRoute(value: string): AppRoute | null {
  const q = value.trim();
  if (!q) return null;
  return { kind: "library", browse: "books", q, searchMode: "global" };
}
