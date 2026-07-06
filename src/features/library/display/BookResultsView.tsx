import type { ReactNode } from "react";
import type { LibraryBook } from "@secondpass/client";
import type { LibraryBooksView } from "../../../storage/libraryBooksView";
import { BookGrid } from "./BookGrid";
import { BookList } from "./BookList";

export function BookResultsView({
  books,
  viewMode,
  selectedBookId,
  onViewBook,
  serverBaseUrl,
  getMetaLines,
  renderActions,
}: {
  books: LibraryBook[];
  viewMode: LibraryBooksView;
  selectedBookId: string | null;
  onViewBook: (book: LibraryBook) => void;
  serverBaseUrl?: string;
  getMetaLines?: (book: LibraryBook) => ReactNode[];
  renderActions?: (book: LibraryBook) => ReactNode;
}) {
  return viewMode === "grid" ? (
    <BookGrid
      books={books}
      selectedBookId={selectedBookId}
      onViewBook={onViewBook}
      serverBaseUrl={serverBaseUrl}
      renderActions={renderActions}
    />
  ) : (
    <BookList
      books={books}
      selectedBookId={selectedBookId}
      onViewBook={onViewBook}
      serverBaseUrl={serverBaseUrl}
      getMetaLines={getMetaLines}
      renderActions={renderActions}
    />
  );
}
