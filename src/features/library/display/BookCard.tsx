import type { LibraryBook } from "@secondpass/client";
import { BookCover } from "./BookCover";
import { formatBookAuthors, formatBookSeries } from "./bookDisplayUtils";

export function BookCard({
  book,
  serverBaseUrl,
  selected,
  onView,
}: {
  book: LibraryBook;
  serverBaseUrl?: string;
  selected: boolean;
  onView: () => void;
}) {
  const authors = formatBookAuthors(book);
  const seriesText = formatBookSeries(book);
  const accessibleLabel = [
    `View details for ${book.title}`,
    authors ? `by ${authors}` : null,
    seriesText,
  ].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      className={`bookGridCard bookDisplayButton ${selected ? "bookDisplaySelected" : ""}`}
      onClick={onView}
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      <BookCover book={book} serverBaseUrl={serverBaseUrl} size="large" />

      <div className="bookGridCardMain">
        <div className="bookTitle">{book.title}</div>
        {authors ? <div className="bookLine">{authors}</div> : null}
      </div>
    </button>
  );
}
