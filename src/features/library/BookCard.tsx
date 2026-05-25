import { useMemo, useState } from "react";
import type { LibraryBook } from "../../schemas/library";
import { getBookCoverUrl } from "./coverUtils";

function formatFileSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return null;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

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
  const authors = (book.authors ?? []).map((a) => a.name).filter(Boolean).join(", ");
  const seriesText =
    book.series?.name && book.series_index != null ? `${book.series.name} #${book.series_index}` : book.series?.name;

  const fileSize = formatFileSize(book.file?.file_size ?? null);

  const [coverBroken, setCoverBroken] = useState(false);
  const coverSrc = useMemo(
    () => (coverBroken ? undefined : getBookCoverUrl(book, serverBaseUrl ?? null)),
    [book, coverBroken, serverBaseUrl],
  );

  return (
    <button
      type="button"
      className={`bookCard bookCardButton ${selected ? "bookCardSelected" : ""}`}
      onClick={onView}
      aria-label={`View details for ${book.title}`}
      title={`View details for ${book.title}`}
    >
      <div className="bookCardRow">
        <div className="bookCardCover">
          {coverSrc ? (
            <img
              className="bookCardCoverImg"
              src={coverSrc}
              alt={`${book.title} cover`}
              loading="lazy"
              onError={() => setCoverBroken(true)}
            />
          ) : (
            <div className="bookCoverPlaceholderText">No cover</div>
          )}
        </div>

        <div className="bookCardMain">
          <div className="bookTitle">{book.title}</div>
          {book.subtitle ? <div className="bookSubtitle">{book.subtitle}</div> : null}

          <div className="bookMeta">
            {authors ? <div className="bookLine">{authors}</div> : null}
            {seriesText ? <div className="bookLine">{seriesText}</div> : null}

            <div className="bookLine muted">
              {[book.language || null, book.published_date || null, fileSize || null].filter(Boolean).join(` ${"\u00B7"} `)}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
