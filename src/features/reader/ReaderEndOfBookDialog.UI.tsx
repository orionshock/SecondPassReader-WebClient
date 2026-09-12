import { useRef } from "react";
import type { CompactBook } from "@secondpass/client";
import { getBookCoverUrl } from "../library/BookCover.Mapper";
import { formatSeriesIndex } from "../library/SeriesMetadata.Presenter";
import { useModalDialogFocus } from "../../components/ModalDialogFocus.Lifecycle";

export function EndOfBookDialog({
  nextBook,
  nextBookStatus,
  coverBase,
  hasSeries,
  onStartNextBook,
  onFinishSession,
  onKeepReading,
  onGoToLibrary,
  returnLabel,
}: {
  nextBook: CompactBook | null;
  nextBookStatus: "idle" | "loading" | "ready" | "error";
  coverBase?: { serverBaseUrl?: string | null; apiBaseUrl?: string | null } | string | null;
  hasSeries: boolean;
  onStartNextBook: (book: CompactBook) => void;
  onFinishSession: () => void;
  onKeepReading: () => void;
  onGoToLibrary?: () => void;
  returnLabel?: string;
}) {
  const seriesIndex = nextBook ? formatSeriesIndex(nextBook.series?.seriesIndex) : null;
  const coverSrc = getBookCoverUrl(nextBook, coverBase);
  const dialogRef = useRef<HTMLElement | null>(null);
  const keepReadingRef = useRef<HTMLButtonElement | null>(null);
  useModalDialogFocus({ active: true, dialogRef, initialFocusRef: keepReadingRef, onDismiss: onKeepReading });

  return (
    <div
      className="modalOverlay endBookOverlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onKeepReading();
      }}
    >
      <section ref={dialogRef} className="endBookDialog" role="dialog" aria-modal="true" aria-labelledby="end-book-title" tabIndex={-1}>
        <div className="endBookHeader">
          <h2 id="end-book-title" className="endBookTitle">You reached the end</h2>
        </div>

        <div className="endBookBody">
          {nextBook ? (
            <div className="endBookNextCard">
              <div className="endBookEyebrow">Next in series</div>
              <div className="endBookNextContent">
                <div className="endBookNextCover" aria-hidden={coverSrc ? undefined : "true"}>
                  {coverSrc ? (
                    <img className="endBookNextCoverImg" src={coverSrc} alt={`${nextBook.title} cover`} loading="lazy" />
                  ) : (
                    <div className="endBookNextCoverPlaceholder">No cover</div>
                  )}
                </div>
                <div className="endBookNextMain">
                  <div className="endBookNextTitle">{nextBook.title}</div>
                  {nextBook.subtitle ? <div className="muted endBookNextSubtitle">{nextBook.subtitle}</div> : null}
                  {seriesIndex ? <div className="muted endBookNextMeta">Series index {seriesIndex}</div> : null}
                  <button type="button" className="button buttonPrimary endBookPrimary" onClick={() => onStartNextBook(nextBook)}>
                    Start next book
                  </button>
                </div>
              </div>
            </div>
          ) : nextBookStatus === "loading" ? (
            <p className="muted endBookMessage">Finding the next book...</p>
          ) : hasSeries ? (
            <p className="muted endBookMessage">No next book found in this series.</p>
          ) : null}
        </div>

        <div className="endBookActions">
          <button ref={keepReadingRef} type="button" className="button" onClick={onKeepReading}>
            Keep reading
          </button>
          {onGoToLibrary ? (
            <button type="button" className="button" onClick={onGoToLibrary}>
              {returnLabel ?? "Go to library"}
            </button>
          ) : null}
          <button type="button" className="button endBookFinishButton" onClick={onFinishSession}>
            Finish Reading Session...
          </button>
        </div>
      </section>
    </div>
  );
}
