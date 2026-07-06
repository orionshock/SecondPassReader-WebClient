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
  const commonProps = {
    books,
    selectedBookId,
    onViewBook,
    serverBaseUrl,
    getMetaLines,
    renderActions,
  };

  return viewMode === "grid" ? <BookGrid {...commonProps} /> : <BookList {...commonProps} />;
}
