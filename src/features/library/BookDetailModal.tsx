import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@secondpass/client";
import type { LibraryBook, ReadingBookActivitySummaryRow, SecondPassClient } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { BookDetailPanel } from "./BookDetailPanel";

export function BookDetailModal({
  profile,
  spl,
  bookId,
  initialBook,
  onClose,
  onOpenReader,
  onViewSessions,
  onViewAuthor,
  onViewSeries,
  onViewTag,
  launchMessage,
  downloadState,
}: {
  profile: ConnectionProfile | null;
  spl: SecondPassClient | null;
  bookId: string;
  initialBook: LibraryBook | null;
  onClose: () => void;
  onOpenReader: (book: LibraryBook) => void;
  onViewSessions: (book: LibraryBook) => void;
  onViewAuthor: (authorId: string) => void;
  onViewSeries: (seriesId: string) => void;
  onViewTag: (tagSlug: string) => void;
  launchMessage: string | null;
  downloadState:
    | { phase: "idle" }
    | { phase: "opening_session" }
    | { phase: "fetching" }
    | { phase: "opening_reader" }
    | { phase: "success"; result: { blob: Blob; contentType?: string; contentLength?: number; contentDisposition?: string; filename?: string } }
    | { phase: "error"; message: string };
}) {
  const [book, setBook] = useState<LibraryBook | null>(null);
  const [activitySummary, setActivitySummary] = useState<ReadingBookActivitySummaryRow | null>(null);
  const [activitySummaryFailed, setActivitySummaryFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchSeqRef = useRef(0);

  useEffect(() => {
    setBook(null);
    setActivitySummary(null);
    setActivitySummaryFailed(false);
    setError(null);
  }, [bookId, initialBook]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const canFetch = Boolean(spl);

  useEffect(() => {
    if (!canFetch || !spl) return;

    fetchSeqRef.current += 1;
    const seq = fetchSeqRef.current;

    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const full = await spl.library.books.get(bookId);
        if (seq !== fetchSeqRef.current) return;
        setBook(full);
      } catch (e) {
        if (seq !== fetchSeqRef.current) return;
        const message =
          e instanceof ApiError && e.status === 404
            ? "That book could not be found or you do not have access to it."
            : e instanceof Error
              ? e.message
              : "Failed to load book.";
        setError(message);
      } finally {
        if (seq !== fetchSeqRef.current) return;
        setBusy(false);
      }
    })();
  }, [bookId, canFetch, spl]);

  useEffect(() => {
    if (!canFetch || !spl) return;

    let cancelled = false;
    setActivitySummary(null);
    setActivitySummaryFailed(false);

    void (async () => {
      try {
        const summary = await spl.reading.books.activitySummary({ books: [bookId] });
        if (cancelled) return;
        setActivitySummary(summary.results[0] ?? null);
      } catch {
        if (cancelled) return;
        setActivitySummaryFailed(true);
        setActivitySummary(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bookId, canFetch, spl]);

  const headerTitle = useMemo(() => book?.title || initialBook?.title || `Book ${bookId}`, [book?.title, bookId, initialBook?.title]);

  return (
    <div
      className="modalOverlay"
      role="dialog"
      aria-modal="true"
      aria-label={headerTitle}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        onClose();
      }}
    >
      <div className="modalPanel" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeaderRow">
          <div className="modalTitle" title={headerTitle}>
            {headerTitle}
          </div>
          <button type="button" className="button buttonCompact" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>

        <div className="modalBody">
          {!canFetch ? <div className="muted">Select a verified profile to view details.</div> : null}
          {busy ? <div className="muted">{`Loading${"\u2026"}`}</div> : null}
          {error ? <div className="errorText">{error}</div> : null}

          {book ? (
            <BookDetailPanel
              book={book}
              serverBaseUrl={profile?.serverBaseUrl}
              launchMessage={launchMessage}
              onOpenReader={onOpenReader}
              onViewSessions={onViewSessions}
              onViewAuthor={onViewAuthor}
              onViewSeries={onViewSeries}
              onViewTag={onViewTag}
              activitySummary={activitySummary}
              activitySummaryFailed={activitySummaryFailed}
              downloadState={downloadState}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
