import type { LibraryBook } from "@secondpass/client";
import type { ReactNode } from "react";
import { BookCard } from "./BookCard";

export function BookGrid({
  books,
  selectedBookId,
  onViewBook,
  serverBaseUrl,
  renderActions,
}: {
  books: LibraryBook[];
  selectedBookId: string | null;
  onViewBook: (book: LibraryBook) => void;
  serverBaseUrl?: string;
  renderActions?: (book: LibraryBook) => ReactNode;
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
          actions={renderActions?.(b)}
        />
      ))}
    </div>
  );
}
