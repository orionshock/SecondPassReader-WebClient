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

export function BookCard({ book }: { book: LibraryBook }) {
  const authors = (book.authors ?? []).map((a) => a.name).filter(Boolean).join(", ");
  const seriesText =
    book.series?.name && book.series_index != null ? `${book.series.name} #${book.series_index}` : book.series?.name;

  const hasFile = Boolean(book.file);
  const fileSize = formatFileSize(book.file?.file_size ?? null);

  return (
    <article className="bookCard">
      <div className="bookHeader">
        <div className="bookTitle">{book.title}</div>
        {book.subtitle ? <div className="bookSubtitle">{book.subtitle}</div> : null}
      </div>

      <div className="bookMeta">
        {authors ? (
          <div>
            <span className="muted">Authors:</span> {authors}
          </div>
        ) : null}
        {seriesText ? (
          <div>
            <span className="muted">Series:</span> {seriesText}
          </div>
        ) : null}
        {book.language ? (
          <div>
            <span className="muted">Language:</span> {book.language}
          </div>
        ) : null}
        {book.published_date ? (
          <div>
            <span className="muted">Published:</span> {book.published_date}
          </div>
        ) : null}
        <div>
          <span className="muted">File:</span>{" "}
          {hasFile ? (
            <>
              <span className="pill pillOk">EPUB available</span>
              {fileSize ? <span className="muted"> ({fileSize})</span> : null}
            </>
          ) : (
            <span className="pill pillIdle">No file</span>
          )}
        </div>
      </div>
    </article>
  );
}

