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

  if (state.status === "loading") return <p className="muted">Loading downloaded books...</p>;
  if (state.status === "unavailable") {
    return <p className="muted">Verify the connection to view books available offline.</p>;
  }
  if (state.status === "error") {
    return <div className="errorText">Books available offline couldn't be loaded. Check browser storage settings and reload the app.</div>;
  }

  return (
    <section className="panel offlineLibraryPanel" aria-labelledby="offline-library-title">
      <div className="offlineLibraryHeader">
        <div>
          <h1 id="offline-library-title" className="panelTitle">Library</h1>
          <p className="muted">Books available offline in this browser.</p>
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
          <h2>No books are available offline</h2>
          <p className="muted">When online, choose Make available offline in Book Detail.</p>
        </div>
      ) : state.visibleBooks.length === 0 ? (
        <p className="muted">No downloaded books match that title.</p>
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
      ? `${book.format.toUpperCase()} isn't supported by Reader.`
      : "Offline copy needs attention.";

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
