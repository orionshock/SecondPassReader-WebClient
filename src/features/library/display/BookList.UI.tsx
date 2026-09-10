import type { CompactBook } from "@secondpass/client";
import type { ReactNode } from "react";
import { BookListRow } from "./BookListRow.UI";

export function BookList({
  books,
  selectedBookId,
  onViewBook,
  serverBaseUrl,
  getMetaLines,
  renderActions,
}: {
  books: CompactBook[];
  selectedBookId: string | null;
  onViewBook: (book: CompactBook) => void;
  serverBaseUrl?: string;
  getMetaLines?: (book: CompactBook) => ReactNode[];
  renderActions?: (book: CompactBook) => ReactNode;
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
