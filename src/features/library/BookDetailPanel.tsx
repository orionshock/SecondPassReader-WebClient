import { useMemo, useState } from "react";
import type { BookFileDownloadResult, LibraryBook } from "../../schemas/library";
import { getBookCoverUrl } from "./coverUtils";
import { getBookDescriptionText } from "./bookTextUtils";

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
  serverBaseUrl,
  launchMessage,
  onOpenReader,
  downloadState,
}: {
  book: LibraryBook;
  serverBaseUrl?: string;
  launchMessage: string | null;
  onOpenReader: (book: LibraryBook) => void;
  downloadState:
    | { phase: "idle" }
    | { phase: "opening_session" }
    | { phase: "fetching" }
    | { phase: "opening_reader" }
    | { phase: "success"; result: BookFileDownloadResult }
    | { phase: "error"; message: string };
}) {
  const authors = (book.authors ?? []).map((a) => a.name).filter(Boolean).join(", ");
  const seriesText =
    book.series?.name && book.series_index != null ? `${book.series.name} #${book.series_index}` : book.series?.name;

  const file = book.file;
  const canOpen = Boolean(file?.download_url);
  const busy =
    downloadState.phase === "opening_session" || downloadState.phase === "fetching" || downloadState.phase === "opening_reader";
  const fileSize = formatFileSize(file?.file_size ?? null);
  const fileStatus = file ? "EPUB available" : "No file";

  const [coverBroken, setCoverBroken] = useState(false);
  const coverSrc = useMemo(
    () => (coverBroken ? undefined : getBookCoverUrl(book, serverBaseUrl ?? null)),
    [book, coverBroken, serverBaseUrl],
  );

  const descriptionText = useMemo(() => getBookDescriptionText(book), [book]);

  return (
    <div className="bookDetailPanel">
      <div className="bookDetailHeader">
        <div className="bookDetailCover">
          {coverSrc ? (
            <img
              className="bookDetailCoverImg"
              src={coverSrc}
              alt={`${book.title} cover`}
              loading="lazy"
              onError={() => setCoverBroken(true)}
            />
          ) : (
            <div className="bookDetailCoverPlaceholder" aria-hidden="true">
              No cover
            </div>
          )}
        </div>

        <div className="bookDetailHeaderText">
          <div className="bookDetailTitle">{book.title}</div>
          {book.subtitle ? <div className="bookDetailSubtitle">{book.subtitle}</div> : null}
          {authors ? <div className="muted">{authors}</div> : null}
          {seriesText ? <div className="muted">{seriesText}</div> : null}

          <div className="bookDetailMetaLine muted">
            {[book.publisher || null, book.language || null, book.published_date || null].filter(Boolean).join(" · ")}
          </div>
        </div>

        <div className="bookDetailActions">
          <button type="button" className="button buttonPrimary" onClick={() => onOpenReader(book)} disabled={!canOpen || busy}>
            Open reader
          </button>
          {!canOpen ? <div className="muted" style={{ marginTop: 6 }}>No EPUB file available.</div> : null}
        </div>
      </div>

      {descriptionText ? <div className="bookDetailSummary">{descriptionText}</div> : null}

      {launchMessage ? <div className="warningText">{launchMessage}</div> : null}
      {downloadState.phase === "opening_session" ? <div className="muted">Opening reading session...</div> : null}
      {downloadState.phase === "fetching" ? <div className="muted">Fetching EPUB...</div> : null}
      {downloadState.phase === "opening_reader" ? <div className="muted">Opening reader...</div> : null}
      {downloadState.phase === "error" ? <div className="errorText">{downloadState.message}</div> : null}
      {downloadState.phase === "success" ? (
        <div className="downloadResultBox">
          <div>
            <span className="pill pillOk">EPUB fetch succeeded</span>
          </div>
          <div className="muted">size: {formatFileSize(downloadState.result.blob.size) ?? `${downloadState.result.blob.size} bytes`}</div>
          {downloadState.result.contentType ? <div className="muted">type: {downloadState.result.contentType}</div> : null}
          {downloadState.result.filename ? <div className="muted">filename: {downloadState.result.filename}</div> : null}
        </div>
      ) : null}

      <details className="bookFilePanel">
        <summary className="muted">Technical details</summary>
        <div className="detailRow">
          <span className="muted">File status:</span> {fileStatus}
          {file?.format ? <span className="muted">({file.format})</span> : null}
          {fileSize ? <span className="muted"> · {fileSize}</span> : null}
        </div>

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

        {file ? (
          <div className="bookFileGrid">
            <div className="detailRow">
              <span className="muted">id:</span> <span className="mono">{String(file.id)}</span>
            </div>
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
        ) : null}
      </details>
    </div>
  );
}
