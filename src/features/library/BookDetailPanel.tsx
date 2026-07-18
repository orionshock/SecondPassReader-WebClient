import { useMemo, useState } from "react";
import type { LibraryBook, ReadingBookActivitySummaryRow } from "@secondpass/client";
import { getBookCoverUrl } from "./coverUtils";
import { getBookDescriptionText } from "./bookTextUtils";
import { InlineMeta } from "../../components/MetaSeparator";
import { formatBookPublishedDate } from "./display/bookDisplayUtils";

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
  onViewSessions,
  activitySummary,
  activitySummaryFailed,
  downloadState,
}: {
  book: LibraryBook;
  serverBaseUrl?: string;
  launchMessage: string | null;
  onOpenReader: (book: LibraryBook) => void;
  onViewSessions: (book: LibraryBook) => void;
  activitySummary?: ReadingBookActivitySummaryRow | null;
  activitySummaryFailed?: boolean;
  downloadState:
    | { phase: "idle" }
    | { phase: "opening_session" }
    | { phase: "fetching" }
    | { phase: "opening_reader" }
    | { phase: "success"; result: { blob: Blob; contentType?: string; contentLength?: number; contentDisposition?: string; filename?: string } }
    | { phase: "error"; message: string };
}) {
  const authors = (book.authors ?? []).map((a) => a.name).filter(Boolean).join(", ");
  const seriesText =
    book.series?.name && book.series.series_index != null ? `${book.series.name} #${book.series.series_index}` : book.series?.name;
  const published = formatBookPublishedDate(book);

  const busy =
    downloadState.phase === "opening_session" || downloadState.phase === "fetching" || downloadState.phase === "opening_reader";
  const sessionCount = typeof activitySummary?.session_count === "number" && Number.isFinite(activitySummary.session_count)
    ? Math.max(0, Math.floor(activitySummary.session_count))
    : null;
  const sessionsUnavailable = !activitySummaryFailed && sessionCount === 0;

  const [coverBroken, setCoverBroken] = useState(false);
  const coverSrc = useMemo(
    () => (coverBroken ? undefined : getBookCoverUrl(book, serverBaseUrl ?? null)),
    [book, coverBroken, serverBaseUrl],
  );

  const descriptionText = useMemo(() => getBookDescriptionText(book), [book]);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

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
            <InlineMeta items={[book.publisher || null, book.language || null, published]} />
          </div>
        </div>

        <div className="bookDetailActions">
          <button
            type="button"
            className="button buttonPrimary bookDetailActionButton"
            onClick={() => onOpenReader(book)}
            disabled={busy}
          >
            Open reader
          </button>
          <button
            type="button"
            className="button buttonPrimary bookDetailActionButton"
            onClick={() => onViewSessions(book)}
            disabled={sessionsUnavailable}
            title={sessionsUnavailable ? "No reading sessions for this book yet" : "View reading sessions for this book"}
            aria-label={sessionsUnavailable ? "No reading sessions for this book yet" : "View reading sessions for this book"}
          >
            Reading sessions
          </button>
        </div>
      </div>

      {descriptionText ? (
        <div className="bookDetailSummaryBlock">
          <div
            className={`bookDetailSummary ${descriptionExpanded ? "bookDetailSummaryExpanded" : "bookDetailSummaryCollapsed"}`}
            id="book-detail-summary"
          >
            {descriptionText}
          </div>
          <button
            type="button"
            className="bookDetailSummaryToggle"
            onClick={() => setDescriptionExpanded((v) => !v)}
            aria-expanded={descriptionExpanded}
            aria-controls="book-detail-summary"
          >
            {descriptionExpanded ? "Show less" : "Show more"}
          </button>
        </div>
      ) : (
        <div className="bookDetailSummaryBlock">
          <div className="bookDetailSummary">
            <span className="muted">
              <em>No Summary Provided</em>
            </span>
          </div>
        </div>
      )}

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
    </div>
  );
}
