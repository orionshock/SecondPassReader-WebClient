import type { ReactNode } from "react";
import type { BoundedSessionBook } from "@secondpass/client";
import { InlineMeta } from "../../components/Metadata.UI";

export function SessionDetailHeader({
  book,
  coverSrc,
  bookLine,
  statusText,
  progressText,
  annotationText,
  startedText,
  updatedText,
  closedText,
  noteContent,
  isActive,
  canOpenReader,
  onOpenReader,
  onCloseSession,
  onOpenBookSessions,
}: {
  book: BoundedSessionBook;
  coverSrc: string | null;
  bookLine: string[];
  statusText: string;
  progressText: string | null;
  annotationText: string | null;
  startedText: string | null;
  updatedText: string | null;
  closedText: string | null;
  noteContent: ReactNode;
  isActive: boolean;
  canOpenReader: boolean;
  onOpenReader: () => void;
  onCloseSession: () => void;
  onOpenBookSessions: () => void;
}) {
  return (
    <div className="sessionHero">
      <div className="sessionHeroCoverColumn">
        <div className="sessionCover">
          {coverSrc ? (
            <img className="sessionCoverImg" src={coverSrc} alt={`${book.title} cover`} loading="lazy" />
          ) : (
            <div className="bookCoverPlaceholderText">No cover</div>
          )}
        </div>
        <div className="sessionHeroActions">
          <button
            type="button"
            className="button buttonPrimary"
            onClick={onOpenReader}
            disabled={!canOpenReader}
          >
            Open reader
          </button>
          {isActive ? (
            <button type="button" className="button buttonCompact buttonDanger" onClick={onCloseSession}>
              Close session
            </button>
          ) : null}
        </div>
      </div>

      <div className="sessionHeroMain">
        {book.id ? (
          <button
            type="button"
            className="sessionBookTitleButton sessionHeroBookTitle"
            onClick={onOpenBookSessions}
            title="View reading sessions for this book"
          >
            {book.title}
          </button>
        ) : (
          <div className="sessionHeroBookTitle">{book.title}</div>
        )}
        {bookLine.length ? <div className="sessionHeroBookLine muted"><InlineMeta items={bookLine} /></div> : null}

        <div className="sessionHeroFacts">
          <div className="sessionHeroFact">
            <span className="sessionHeroFactLabel">Status</span>
            <span><span className={`pill ${isActive ? "pillOk" : "pillIdle"}`}>{statusText}</span></span>
          </div>
          {progressText ? (
            <div className="sessionHeroFact">
              <span className="sessionHeroFactLabel">Location</span>
              <span>{progressText}</span>
            </div>
          ) : null}
          {annotationText ? (
            <div className="sessionHeroFact">
              <span className="sessionHeroFactLabel">Annotations</span>
              <span>{annotationText}</span>
            </div>
          ) : null}
        </div>

        <div className="sessionHeroDates">
          {startedText ? <div><span className="muted">Started</span><span>{startedText}</span></div> : null}
          {updatedText ? <div><span className="muted">Updated</span><span>{updatedText}</span></div> : null}
          {closedText ? <div><span className="muted">Closed</span><span>{closedText}</span></div> : null}
        </div>
      </div>

      <div className="sessionHeroNote">{noteContent}</div>
    </div>
  );
}
