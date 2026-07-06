import type { KeyboardEvent, ReactNode } from "react";
import type { LibraryBook } from "@secondpass/client";
import { BookCover } from "./BookCover";
import { formatBookAuthors, formatBookSeries } from "./bookDisplayUtils";

export function BookCard({
  book,
  serverBaseUrl,
  selected,
  onView,
  actions,
}: {
  book: LibraryBook;
  serverBaseUrl?: string;
  selected: boolean;
  onView: () => void;
  actions?: ReactNode;
}) {
  const authors = formatBookAuthors(book);
  const seriesText = formatBookSeries(book);
  const accessibleLabel = [
    `View details for ${book.title}`,
    authors ? `by ${authors}` : null,
    seriesText,
  ].filter(Boolean).join(" - ");
  const cardClassName = `bookGridCard bookDisplayButton ${selected ? "bookDisplaySelected" : ""}`;
  const mainContent = (
    <>
      <BookCover book={book} serverBaseUrl={serverBaseUrl} size="large" />
    </>
  );

  if (actions) {
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onView();
    };

    return (
      <div
        className={cardClassName}
        role="button"
        tabIndex={0}
        onClick={onView}
        onKeyDown={handleKeyDown}
        aria-label={accessibleLabel}
        title={accessibleLabel}
      >
        {mainContent}
        <div className="bookDisplayActions">{actions}</div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cardClassName}
      onClick={onView}
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      {mainContent}
    </button>
  );
}
