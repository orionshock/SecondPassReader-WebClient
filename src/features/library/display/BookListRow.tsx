import type { LibraryBook } from "@secondpass/client";
import { BookCover } from "./BookCover";
import { formatBookAuthors, formatBookSeries } from "./bookDisplayUtils";

export function BookListRow({
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
      className={`bookListRow bookDisplayButton ${selected ? "bookDisplaySelected" : ""}`}
      onClick={onView}
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      <BookCover book={book} serverBaseUrl={serverBaseUrl} />

      <div className="bookListRowMain">
        <div className="bookTitle">{book.title}</div>
        {book.subtitle ? <div className="bookSubtitle">{book.subtitle}</div> : null}

        <div className="bookMeta">
          {authors ? <div className="bookLine">{authors}</div> : null}
          {seriesText ? <div className="bookLine">{seriesText}</div> : null}
        </div>
      </div>
    </button>
  );
}
