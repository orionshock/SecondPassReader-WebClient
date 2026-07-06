import type { KeyboardEvent, ReactNode } from "react";
import type { LibraryBook } from "@secondpass/client";
import { BookCover } from "./BookCover";
import { formatBookAuthors, formatBookSeries } from "./bookDisplayUtils";

export function BookCard({
  book,
  serverBaseUrl,
  selected,
  onView,
  metaLines,
  actions,
}: {
  book: LibraryBook;
  serverBaseUrl?: string;
  selected: boolean;
  onView: () => void;
  metaLines?: ReactNode[];
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

      <div className="bookGridCardMain">
        <div className="bookTitle">{book.title}</div>
        {authors ? <div className="bookLine">{authors}</div> : null}
        {metaLines?.map((line, index) => (line ? <div key={index} className="bookLine muted">{line}</div> : null))}
      </div>
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
