import type { ReactNode } from "react";
import type { CompactBook } from "@secondpass/client";
import { BookCover } from "./BookCover.UI";
import { formatBookAuthors, formatBookSeries } from "./BookDisplay.Presenter";

export function BookListRow({
  book,
  serverBaseUrl,
  selected,
  onView,
  metaLines,
  actions,
}: {
  book: CompactBook;
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
  const rowClassName = `bookListRow bookDisplayButton ${selected ? "bookDisplaySelected" : ""}`;
  const mainContent = (
    <>
      <BookCover book={book} serverBaseUrl={serverBaseUrl} />

      <div className="bookListRowMain">
        <div className="bookTitle">{book.title}</div>
        {book.subtitle ? <div className="bookSubtitle">{book.subtitle}</div> : null}

        <div className="bookMeta">
          {authors ? <div className="bookLine">{authors}</div> : null}
          {seriesText ? <div className="bookLine">{seriesText}</div> : null}
          {metaLines?.map((line, index) => (line ? <div key={index} className="bookLine muted">{line}</div> : null))}
        </div>
      </div>
    </>
  );

  if (actions) {
    return (
      <div className={`${rowClassName} bookListRowWithActions`}>
        <button type="button" className="bookListRowOpenButton" onClick={onView} aria-label={accessibleLabel} title={accessibleLabel}>
          {mainContent}
        </button>
        <div className="bookDisplayActions">{actions}</div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={rowClassName}
      onClick={onView}
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      {mainContent}
    </button>
  );
}
