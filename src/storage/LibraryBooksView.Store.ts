export type LibraryBooksView = "list" | "grid";

const STORAGE_KEY = "secondpass.library.booksView";

export function normalizeLibraryBooksView(value: unknown): LibraryBooksView | null {
  return value === "list" || value === "grid" ? value : null;
}

export function getLibraryBooksView(defaultValue: LibraryBooksView = "list"): LibraryBooksView {
  try {
    return normalizeLibraryBooksView(localStorage.getItem(STORAGE_KEY)) ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

export function saveLibraryBooksView(view: LibraryBooksView): void {
  try {
    localStorage.setItem(STORAGE_KEY, view);
  } catch {
    // Ignore localStorage write failures.
  }
}
