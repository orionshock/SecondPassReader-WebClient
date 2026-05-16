import type { LibraryBook } from "../../schemas/library";
import { BookCard } from "./BookCard";

export function BookList({
  books,
  selectedBookId,
  onSelectBook,
}: {
  books: LibraryBook[];
  selectedBookId: string | null;
  onSelectBook: (book: LibraryBook) => void;
}) {
  if (books.length === 0) return <p className="muted">No books found.</p>;
  return (
    <div className="bookList">
      {books.map((b) => (
        <BookCard
          key={String(b.id)}
          book={b}
          selected={String(b.id) === selectedBookId}
          onSelect={() => onSelectBook(b)}
        />
      ))}
    </div>
  );
}
