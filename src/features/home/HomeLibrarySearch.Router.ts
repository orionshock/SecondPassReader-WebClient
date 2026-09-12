import type { AppRoute } from "../../app/AppNavigation.Router";

export const HOME_LIBRARY_SEARCH_LABEL = "Search Library";
export const HOME_LIBRARY_SEARCH_PLACEHOLDER = "Search books, authors, series, and publishers...";

export function getHomeLibrarySearchRoute(value: string): AppRoute | null {
  const q = value.trim();
  if (!q) return null;
  return { kind: "library", browse: "books", q, searchMode: "global" };
}
