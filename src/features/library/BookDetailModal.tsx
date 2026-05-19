import { useEffect, useMemo, useState } from "react";
import { ApiError, SecondPassApiClient } from "../../api/SecondPassApiClient";
import type { LibraryBook } from "../../schemas/library";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { BookDetailPanel } from "./BookDetailPanel";

export function BookDetailModal({
  profile,
  bookId,
  initialBook,
  onClose,
  onOpenReader,
  launchMessage,
  downloadState,
}: {
  profile: ConnectionProfile | null;
  bookId: string;
  initialBook: LibraryBook | null;
  onClose: () => void;
  onOpenReader: (book: LibraryBook) => void;
  launchMessage: string | null;
  downloadState:
    | { phase: "idle" }
    | { phase: "opening_session" }
    | { phase: "fetching" }
    | { phase: "opening_reader" }
    | { phase: "success"; result: { blob: Blob; contentType?: string; contentLength?: number; contentDisposition?: string; filename?: string } }
    | { phase: "error"; message: string };
}) {
  const [book, setBook] = useState<LibraryBook | null>(initialBook);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBook(initialBook);
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

  const canFetch = Boolean(profile?.apiBaseUrl && profile?.accessToken);

  useEffect(() => {
    if (!canFetch) return;
    if (!profile?.apiBaseUrl || !profile.accessToken) return;
    if (!profile.serverBaseUrl) return;
    if (book && String(book.id) === String(bookId)) return;

    const apiBaseUrl = profile.apiBaseUrl;
    const accessToken = profile.accessToken;
    const tokenType = profile.tokenType ?? "Bearer";
    const serverBaseUrl = profile.serverBaseUrl;

    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const api = new SecondPassApiClient({ serverBaseUrl });
        const full = await api.getBook({
          apiBaseUrl,
          accessToken,
          tokenType,
          bookId,
        });
        setBook(full);
      } catch (e) {
        const message =
          e instanceof ApiError && e.status === 404
            ? "That book could not be found or you do not have access to it."
            : e instanceof Error
              ? e.message
              : "Failed to load book.";
        setError(message);
      } finally {
        setBusy(false);
      }
    })();
  }, [book, bookId, canFetch, profile]);

  const headerTitle = useMemo(() => (book?.title ? book.title : `Book ${bookId}`), [book?.title, bookId]);

  return (
    <div
      className="modalOverlay"
      role="dialog"
      aria-modal="true"
      aria-label={headerTitle}
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        onClose();
      }}
    >
      <div className="modalPanel" onMouseDown={(e) => e.stopPropagation()}>
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
          {busy ? <div className="muted">Loading…</div> : null}
          {error ? <div className="errorText">{error}</div> : null}

          {book ? (
            <BookDetailPanel
              book={book}
              serverBaseUrl={profile?.serverBaseUrl}
              launchMessage={launchMessage}
              onOpenReader={onOpenReader}
              downloadState={downloadState}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
