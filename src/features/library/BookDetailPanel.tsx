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

export function BookDetailPanel({
  book,
  launchMessage,
  onOpenReader,
}: {
  book: LibraryBook;
  launchMessage: string | null;
  onOpenReader: (book: LibraryBook) => void;
}) {
  const authors = (book.authors ?? []).map((a) => a.name).filter(Boolean).join(", ");
  const seriesText =
    book.series?.name && book.series_index != null ? `${book.series.name} #${book.series_index}` : book.series?.name;

  const file = book.file;
  const canOpen = Boolean(file?.download_url);
  const fileSize = formatFileSize(file?.file_size ?? null);

  return (
    <div className="bookDetailPanel">
      <div className="bookDetailHeader">
        <div>
          <div className="bookDetailTitle">{book.title}</div>
          {book.subtitle ? <div className="bookDetailSubtitle">{book.subtitle}</div> : null}
        </div>
        <div className="bookDetailActions">
          <button type="button" className="button buttonPrimary" onClick={() => onOpenReader(book)} disabled={!canOpen}>
            Open reader
          </button>
        </div>
      </div>

      {!canOpen ? <div className="muted">No EPUB file available for this book.</div> : null}
      {launchMessage ? <div className="warningText">{launchMessage}</div> : null}

      <div className="bookDetailGrid">
        {authors ? (
          <div className="detailRow">
            <span className="muted">Authors:</span> {authors}
          </div>
        ) : null}
        {seriesText ? (
          <div className="detailRow">
            <span className="muted">Series:</span> {seriesText}
          </div>
        ) : null}
        {book.publisher ? (
          <div className="detailRow">
            <span className="muted">Publisher:</span> {book.publisher}
          </div>
        ) : null}
        {book.language ? (
          <div className="detailRow">
            <span className="muted">Language:</span> {book.language}
          </div>
        ) : null}
        {book.published_date ? (
          <div className="detailRow">
            <span className="muted">Published:</span> {book.published_date}
          </div>
        ) : null}
        {book.isbn ? (
          <div className="detailRow">
            <span className="muted">ISBN:</span> <span className="mono">{book.isbn}</span>
          </div>
        ) : null}
        {book.subjects && book.subjects.length > 0 ? (
          <div className="detailRow">
            <span className="muted">Subjects:</span> {book.subjects.join(", ")}
          </div>
        ) : null}
        {book.summary ? (
          <div className="detailRow detailSummary">
            <span className="muted">Summary:</span> <span className="detailSummaryText">{book.summary}</span>
          </div>
        ) : null}
      </div>

      <div className="bookFilePanel">
        <div className="muted">File</div>
        {file ? (
          <div className="bookFileGrid">
            <div className="detailRow">
              <span className="muted">id:</span> <span className="mono">{String(file.id)}</span>
            </div>
            {file.format ? (
              <div className="detailRow">
                <span className="muted">format:</span> {file.format}
              </div>
            ) : null}
            {fileSize ? (
              <div className="detailRow">
                <span className="muted">size:</span> {fileSize}
              </div>
            ) : null}
            {file.checksum_short ? (
              <div className="detailRow">
                <span className="muted">checksum:</span> <span className="mono">{file.checksum_short}</span>
              </div>
            ) : null}
            {file.download_url ? (
              <div className="detailRow">
                <span className="muted">download_url:</span> <span className="mono">{file.download_url}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="muted">No file.</div>
        )}
      </div>
    </div>
  );
}

