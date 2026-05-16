import type { LibraryBook } from "../../schemas/library";

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
  selected,
  onSelect,
}: {
  book: LibraryBook;
  selected: boolean;
  onSelect: () => void;
}) {
  const authors = (book.authors ?? []).map((a) => a.name).filter(Boolean).join(", ");
  const seriesText =
    book.series?.name && book.series_index != null ? `${book.series.name} #${book.series_index}` : book.series?.name;

  const hasFile = Boolean(book.file);
  const fileSize = formatFileSize(book.file?.file_size ?? null);

  return (
    <article className={`bookCard ${selected ? "bookCardSelected" : ""}`}>
      <div className="bookTitleRow">
        <div className="bookTitle">{book.title}</div>
        <div className="bookCardRight">
          <button type="button" className="button buttonCompact" onClick={onSelect}>
            {selected ? "Selected" : "View"}
          </button>
          {hasFile ? <span className="pill pillOk">EPUB</span> : <span className="pill pillIdle">No file</span>}
        </div>
      </div>

      {book.subtitle ? <div className="bookSubtitle">{book.subtitle}</div> : null}

      <div className="bookMeta">
        {authors ? <div className="bookLine">{authors}</div> : null}
        {seriesText ? <div className="bookLine">{seriesText}</div> : null}

        <div className="bookLine muted">
          {[book.language || null, book.published_date || null, hasFile && fileSize ? fileSize : null]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
    </article>
  );
}

