import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@secondpass/client";
import type { BookDetail, CompactBook, MarginaliaBookSummary, SecondPassClient } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";
import { BookDetailPanel } from "./BookDetailPanel.UI";
import { useBookOfflineAvailabilityController } from "./bookDetail/BookOfflineAvailability.Controller";
import { useModalDialogFocus } from "../../components/ModalDialogFocus.Lifecycle";
import { debugWarn } from "../../lib/debug/DebugLogger.Diagnostics";

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
  onManageShelves,
  onManageOffline,
  launchMessage,
  downloadState,
}: {
  profile: ConnectionProfile | null;
  spl: SecondPassClient | null;
  bookId: string;
  initialBook: CompactBook | null;
  onClose: () => void;
  onOpenReader: (book: BookDetail) => void;
  onViewSessions: (book: BookDetail) => void;
  onViewAuthor: (authorId: string) => void;
  onViewSeries: (seriesId: string) => void;
  onViewTag: (tagSlug: string) => void;
  onManageShelves: () => void;
  onManageOffline: (book: BookDetail) => void;
  launchMessage: string | null;
  downloadState:
    | { phase: "idle" }
    | { phase: "opening_session" }
    | { phase: "fetching" }
    | { phase: "opening_reader" }
    | { phase: "success"; result: { blob: Blob; contentType?: string; contentLength?: number; contentDisposition?: string; filename?: string } }
    | { phase: "error"; message: string };
}) {
  const [book, setBook] = useState<BookDetail | null>(null);
  const [activitySummary, setActivitySummary] = useState<MarginaliaBookSummary | null>(null);
  const [activitySummaryFailed, setActivitySummaryFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchSeqRef = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const offlineAvailability = useBookOfflineAvailabilityController({ profile, book, spl });

  useModalDialogFocus({ active: true, dialogRef, initialFocusRef: closeButtonRef, onDismiss: onClose });

  useEffect(() => {
    setBook(null);
    setActivitySummary(null);
    setActivitySummaryFailed(false);
    setError(null);
  }, [bookId, initialBook]);

  const canFetch = Boolean(spl);

  useEffect(() => {
    fetchSeqRef.current += 1;
    const seq = fetchSeqRef.current;
    if (!canFetch || !spl) return;

    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const full = await spl.library.books.get(bookId);
        if (seq !== fetchSeqRef.current) return;
        setBook(full);
      } catch (e) {
        if (seq !== fetchSeqRef.current) return;
        debugWarn("reader", "Book details could not be loaded", { bookId, error: e });
        const message =
          e instanceof ApiError && e.status === 404
            ? "Book not found or unavailable to this account."
            : "Couldn't load Book details. Close and reopen the Book to try again.";
        setError(message);
      } finally {
        if (seq !== fetchSeqRef.current) return;
        setBusy(false);
      }
    })();

    return () => {
      if (seq === fetchSeqRef.current) fetchSeqRef.current += 1;
    };
  }, [bookId, canFetch, spl]);

  useEffect(() => {
    if (!canFetch || !spl) return;

    let cancelled = false;
    setActivitySummary(null);
    setActivitySummaryFailed(false);

    void (async () => {
      try {
        const summary = await spl.marginalia.books.get(bookId);
        if (cancelled) return;
        setActivitySummary(summary);
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
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        onClose();
      }}
    >
      <div ref={dialogRef} className="modalPanel" role="dialog" aria-modal="true" aria-labelledby="book-detail-dialog-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="modalHeaderRow">
          <div id="book-detail-dialog-title" className="modalTitle" title={headerTitle}>
            {headerTitle}
          </div>
          <button ref={closeButtonRef} type="button" className="button buttonCompact" onClick={onClose} aria-label="Close book details">
            Close
          </button>
        </div>

        <div className="modalBody">
          {!canFetch ? <div className="muted">Verify the connection to view book details.</div> : null}
          {busy ? <div className="muted">Loading book details...</div> : null}
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
              onManageShelves={onManageShelves}
              onManageOffline={() => onManageOffline(book)}
              spl={spl}
              activitySummary={activitySummary}
              activitySummaryFailed={activitySummaryFailed}
              downloadState={downloadState}
              offlineAvailability={offlineAvailability}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
