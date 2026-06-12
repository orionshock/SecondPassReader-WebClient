import type { LibraryBook } from "@secondpass/client";
import { BookListRow } from "./BookListRow";

export function BookList({
  books,
  selectedBookId,
  onViewBook,
  serverBaseUrl,
}: {
  books: LibraryBook[];
  selectedBookId: string | null;
  onViewBook: (book: LibraryBook) => void;
  serverBaseUrl?: string;
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
        />
      ))}
    </div>
  );
}
