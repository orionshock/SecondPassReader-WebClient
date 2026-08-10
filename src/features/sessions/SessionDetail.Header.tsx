import type { BoundedSessionBook, MarginaliaSession } from "@secondpass/client";
import { InlineMeta } from "../../components/Metadata.Presenter";

export function SessionDetailHeader({
  session,
  book,
  coverSrc,
  bookLine,
  statusText,
  progressText,
  annotationText,
  isActive,
  canOpenReader,
  onOpenReader,
  onCloseSession,
  onOpenBookSessions,
}: {
  session: MarginaliaSession;
  book: BoundedSessionBook;
  coverSrc: string | null;
  bookLine: string[];
  statusText: string;
  progressText: string | null;
  annotationText: string | null;
  isActive: boolean;
  canOpenReader: boolean;
  onOpenReader: () => void;
  onCloseSession: () => void;
  onOpenBookSessions: () => void;
}) {
  return (
      <div className="sessionHeader">
        <div className="sessionCover">
          {coverSrc ? <img className="sessionCoverImg" src={coverSrc} alt={`${book.title} cover`} loading="lazy" /> : <div className="bookCoverPlaceholderText">No cover</div>}
        </div>
        <div className="sessionHeaderMain">
          {book.id ? (
            <button
              type="button"
              className="sessionBookTitleButton bookTitle"
              onClick={onOpenBookSessions}
              title="View reading sessions for this book"
            >
              {book.title}
            </button>
          ) : (
            <div className="bookTitle">{book.title}</div>
          )}
          {bookLine.length ? <div className="muted"><InlineMeta items={bookLine} /></div> : null}
          <div className="muted">
            <span className="sessionsId">{session.id}</span>
          </div>
          <div className="muted">
            <InlineMeta items={[statusText || null, progressText || null, annotationText || null]} />
          </div>
        </div>
        <div className="sessionHeaderActions">
          <button
            type="button"
            className="button buttonPrimary"
            onClick={onOpenReader}
            disabled={!canOpenReader}
          >
            Open reader
          </button>
          {isActive ? (
            <button type="button" className="button buttonCompact" onClick={onCloseSession}>
              Close session
            </button>
          ) : null}
        </div>
      </div>
  );
}
