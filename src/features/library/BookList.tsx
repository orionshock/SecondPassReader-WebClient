import type { LibraryBook } from "../../schemas/library";
import { BookCard } from "./BookCard";

export function BookList({ books }: { books: LibraryBook[] }) {
  if (books.length === 0) return <p className="muted">No books found.</p>;
  return (
    <div className="bookList">
      {books.map((b) => (
        <BookCard key={String(b.id)} book={b} />
      ))}
    </div>
  );
}

