import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createOfflineLibraryController } from "./OfflineLibrary.Controller";
import type { OfflineLibraryBook } from "./OfflineLibrary.Presenter";

export function OfflineLibraryPage({
  namespaceKey,
  onViewBook,
}: {
  namespaceKey: string | null;
  onViewBook(bookId: string): void;
}) {
  const controller = useMemo(() => createOfflineLibraryController(namespaceKey), [namespaceKey]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => controller.start(), [controller]);

  if (state.status === "loading") return <p className="muted">{`Loading downloaded books${"\u2026"}`}</p>;
  if (state.status === "unavailable") {
    return <p className="muted">Offline Library is unavailable until this connection is verified.</p>;
  }
  if (state.status === "error") {
    return <div className="errorText">Downloaded books could not be loaded.</div>;
  }

  return (
    <section className="panel offlineLibraryPanel" aria-labelledby="offline-library-title">
      <div className="offlineLibraryHeader">
        <div>
          <h2 id="offline-library-title" className="panelTitle">Library</h2>
          <p className="muted">Showing books available on this device.</p>
        </div>
        <label className="offlineLibrarySearch">
          <span className="srOnly">Search downloaded books</span>
          <input
            className="textInput"
            type="search"
            value={state.query}
            placeholder="Search downloaded books"
            onChange={(event) => controller.setQuery(event.target.value)}
          />
        </label>
      </div>

      {state.books.length === 0 ? (
        <div className="emptyState">
          <h3>No books are available offline.</h3>
          <p className="muted">When online, use Make available offline from a book to keep it on this device.</p>
        </div>
      ) : state.visibleBooks.length === 0 ? (
        <p className="muted">No downloaded books match this title.</p>
      ) : (
        <div className="bookList">
          {state.visibleBooks.map((book) => (
            <OfflineLibraryRow key={book.key} book={book} onViewBook={onViewBook} />
          ))}
        </div>
      )}
    </section>
  );
}

function OfflineLibraryRow({
  book,
  onViewBook,
}: {
  book: OfflineLibraryBook;
  onViewBook(bookId: string): void;
}) {
  const available = book.admission === "available";
  const status = available
    ? "Available offline"
    : book.admission === "unsupported-format"
      ? `${book.format.toUpperCase()} is not supported by this Reader`
      : "Offline copy cannot be opened";

  return (
    <article className="bookDisplayButton bookListRow offlineLibraryBookRow">
      <div className="bookCover bookCoverSmall" aria-hidden="true">
        <div className="bookCoverPlaceholderText">No cover</div>
      </div>
      <div className="bookListRowMain">
        <div className="bookTitle">{book.title}</div>
        <div className="bookSubtitle">{status}</div>
        <div className="bookMeta muted">{book.format.toUpperCase()}</div>
      </div>
      <div className="bookDisplayActions">
        <button
          type="button"
          className="button buttonCompact"
          onClick={() => onViewBook(book.bookId)}
        >
          View details
        </button>
      </div>
    </article>
  );
}
