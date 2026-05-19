import type { LibraryBook } from "../../schemas/library";
import { BookCard } from "./BookCard";

export function BookList({
  books,
  selectedBookId,
  onSelectBook,
  serverBaseUrl,
}: {
  books: LibraryBook[];
  selectedBookId: string | null;
  onSelectBook: (book: LibraryBook) => void;
  serverBaseUrl?: string;
}) {
  if (books.length === 0) return <p className="muted">No books found.</p>;
  return (
    <div className="bookList">
      {books.map((b) => (
        <BookCard
          key={String(b.id)}
          book={b}
          serverBaseUrl={serverBaseUrl}
          selected={String(b.id) === selectedBookId}
          onSelect={() => onSelectBook(b)}
        />
      ))}
    </div>
  );
}
