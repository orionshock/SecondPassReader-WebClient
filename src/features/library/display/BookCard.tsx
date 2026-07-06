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
  ].filter(Boolean).join(" - ");
  const cardClassName = `bookGridCard bookDisplayButton ${selected ? "bookDisplaySelected" : ""}`;

  return (
    <button
      type="button"
      className={cardClassName}
      onClick={onView}
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      <BookCover book={book} serverBaseUrl={serverBaseUrl} size="large" />
    </button>
  );
}
