import { useMemo, useState } from "react";
import type { BookDetail, MarginaliaBookSummary, SecondPassClient } from "@secondpass/client";
import { getBookCoverUrl } from "./BookCover.Mapper";
import { getBookDescriptionText } from "./BookDescription.Presenter";
import { InlineMeta } from "../../components/Metadata.Presenter";
import { formatBookPublishedDate } from "./display/BookDisplay.Presenter";
import { AddToShelfMenu } from "./bookDetail/AddToShelf.Menu";

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
  onViewAuthor,
  onViewSeries,
  onViewTag,
  onManageShelves,
  spl,
  activitySummary,
  activitySummaryFailed,
  downloadState,
}: {
  book: BookDetail;
  serverBaseUrl?: string;
  launchMessage: string | null;
  onOpenReader: (book: BookDetail) => void;
  onViewSessions: (book: BookDetail) => void;
  onViewAuthor: (authorId: string) => void;
  onViewSeries: (seriesId: string) => void;
  onViewTag: (tagSlug: string) => void;
  onManageShelves: () => void;
  spl: SecondPassClient | null;
  activitySummary?: MarginaliaBookSummary | null;
  activitySummaryFailed?: boolean;
  downloadState:
    | { phase: "idle" }
    | { phase: "opening_session" }
    | { phase: "fetching" }
    | { phase: "opening_reader" }
    | { phase: "success"; result: { blob: Blob; contentType?: string; contentLength?: number; contentDisposition?: string; filename?: string } }
    | { phase: "error"; message: string };
}) {
  const seriesText =
    book.series?.name && book.series.seriesIndex != null ? `${book.series.name} #${book.series.seriesIndex}` : book.series?.name;
  const published = formatBookPublishedDate(book);

  const busy =
    downloadState.phase === "opening_session" || downloadState.phase === "fetching" || downloadState.phase === "opening_reader";
  const sessionCount = typeof activitySummary?.sessionCount === "number" && Number.isFinite(activitySummary.sessionCount)
    ? Math.max(0, Math.floor(activitySummary.sessionCount))
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
      <div className="bookDetailHero">
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

        <div className="bookDetailHeroContent">
          <h2 className="bookDetailTitle">{book.title}</h2>
          {book.subtitle ? <div className="bookDetailSubtitle">{book.subtitle}</div> : null}

          {book.series && seriesText ? (
            <div className="bookDetailRelationLine muted">
              <span>Series</span>
              <button type="button" className="bookDetailLink" onClick={() => onViewSeries(String(book.series!.id))}>{seriesText}</button>
            </div>
          ) : null}
          {book.authors?.length ? (
            <div className="bookDetailRelationLine muted">
              <span>By</span>
              <span className="bookDetailLinkList">
                {book.authors.map((author, index) => (
                  <span key={String(author.id)}>
                    {index > 0 ? ", " : null}
                    <button type="button" className="bookDetailLink" onClick={() => onViewAuthor(String(author.id))}>{author.name}</button>
                  </span>
                ))}
              </span>
            </div>
          ) : null}

          <div className="bookDetailMetaLine muted">
            <InlineMeta items={[book.publisher || null, book.language || null, published]} />
          </div>

          {book.catalogTags.length ? (
            <div className="bookDetailTags" aria-label="Catalog tags">
              {book.catalogTags.map((tag) => (
                <button key={String(tag.id)} type="button" className="bookDetailTagChip" onClick={() => onViewTag(tag.slug)}>{tag.name}</button>
              ))}
            </div>
          ) : null}

          {book.groups.length ? (
            <div className="bookDetailRelationLine muted">
              <span>Groups</span>
              <span>{book.groups.map((group) => group.name).join(", ")}</span>
            </div>
          ) : null}

          {book.file ? (
            <div className="bookDetailMetaLine muted">
              <InlineMeta items={[book.file.format, formatFileSize(book.file.fileSize)]} />
            </div>
          ) : (
            <div className="bookDetailMetaLine muted">EPUB file unavailable</div>
          )}

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
                <span className="muted"><em>No Summary Provided</em></span>
              </div>
            </div>
          )}

        </div>

        <div className="bookDetailActions">
          <button type="button" className="button buttonPrimary" onClick={() => onOpenReader(book)} disabled={busy || !book.file}>
            Open reader
          </button>
          <button
            type="button"
            className="button"
            onClick={() => onViewSessions(book)}
            disabled={sessionsUnavailable}
            title={sessionsUnavailable ? "No reading sessions for this book yet" : "View reading sessions for this book"}
            aria-label={sessionsUnavailable ? "No reading sessions for this book yet" : "View reading sessions for this book"}
          >
            Reading sessions
          </button>
          {spl ? <AddToShelfMenu spl={spl} bookId={String(book.id)} onManageShelves={onManageShelves} /> : null}
        </div>
      </div>

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
