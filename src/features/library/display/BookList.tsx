import type { LibraryBook } from "@secondpass/client";
import type { ReactNode } from "react";
import { BookListRow } from "./BookListRow";

export function BookList({
  books,
  selectedBookId,
  onViewBook,
  serverBaseUrl,
  getMetaLines,
  renderActions,
}: {
  books: LibraryBook[];
  selectedBookId: string | null;
  onViewBook: (book: LibraryBook) => void;
  serverBaseUrl?: string;
  getMetaLines?: (book: LibraryBook) => ReactNode[];
  renderActions?: (book: LibraryBook) => ReactNode;
}) {
  if (books.length === 0) return <p className="muted">No books found.</p>;
  return (
    <div className="bookList">
      {books.map((b) => (
        <BookListRow
          key={String(b.id)}
          book={b}
          serverBaseUrl={serverBaseUrl}
          selected={String(b.id) === selectedBookId}
          onView={() => onViewBook(b)}
          metaLines={getMetaLines?.(b)}
          actions={renderActions?.(b)}
        />
      ))}
    </div>
  );
}
