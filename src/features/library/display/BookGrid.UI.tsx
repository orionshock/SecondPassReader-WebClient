import type { CompactBook } from "@secondpass/client";
import { BookCard } from "./BookCard.UI";

export function BookGrid({
  books,
  selectedBookId,
  onViewBook,
  serverBaseUrl,
}: {
  books: CompactBook[];
  selectedBookId: string | null;
  onViewBook: (book: CompactBook) => void;
  serverBaseUrl?: string;
}) {
  if (books.length === 0) return <p className="muted">No books found.</p>;
  return (
    <div className="bookGrid">
      {books.map((b) => (
        <BookCard
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
