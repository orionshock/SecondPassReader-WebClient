import type { ReactNode } from "react";
import type { CompactBook } from "@secondpass/client";
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
  books: CompactBook[];
  viewMode: LibraryBooksView;
  selectedBookId: string | null;
  onViewBook: (book: CompactBook) => void;
  serverBaseUrl?: string;
  getMetaLines?: (book: CompactBook) => ReactNode[];
  renderActions?: (book: CompactBook) => ReactNode;
}) {
  return viewMode === "grid" ? (
    <BookGrid
      books={books}
      selectedBookId={selectedBookId}
      onViewBook={onViewBook}
      serverBaseUrl={serverBaseUrl}
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
