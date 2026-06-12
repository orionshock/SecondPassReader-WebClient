import { useEffect } from "react";
import type { LibraryBook } from "@secondpass/client";
import { getBookCoverUrl } from "../library/coverUtils";
import { formatSeriesIndex } from "../library/seriesUtils";

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
  nextBook: LibraryBook | null;
  nextBookStatus: "idle" | "loading" | "ready" | "error";
  coverBase?: { serverBaseUrl?: string | null; apiBaseUrl?: string | null } | string | null;
  hasSeries: boolean;
  onStartNextBook: (book: LibraryBook) => void;
  onFinishSession: () => void;
  onKeepReading: () => void;
  onGoToLibrary?: () => void;
  returnLabel?: string;
}) {
  const seriesIndex = nextBook ? formatSeriesIndex(nextBook.series_index) : null;
  const coverSrc = getBookCoverUrl(nextBook, coverBase);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onKeepReading();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeepReading]);

  return (
    <div
      className="modalOverlay endBookOverlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onKeepReading();
      }}
    >
      <section className="endBookDialog" role="dialog" aria-modal="true" aria-labelledby="end-book-title">
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
            <p className="muted endBookMessage">Looking for the next book in this series.</p>
          ) : hasSeries ? (
            <p className="muted endBookMessage">No next book was found for this series.</p>
          ) : null}
        </div>

        <div className="endBookActions">
          <button type="button" className="button" onClick={onKeepReading}>
            Keep reading
          </button>
          {onGoToLibrary ? (
            <button type="button" className="button" onClick={onGoToLibrary}>
              {returnLabel ?? "Go to library"}
            </button>
          ) : null}
          <button type="button" className="button endBookFinishButton" onClick={onFinishSession}>
            Finish this session…
          </button>
        </div>
      </section>
    </div>
  );
}
