import { useCallback, useMemo, useState } from "react";
import { navigateTo } from "../../app/AppNavigation.Router";
import type { CompactBook, SecondPassClient } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";
import { BookResultsView } from "../library/display/BookResultsView.UI";
import { BookViewModeToggle } from "../library/display/BookViewModeControl.UI";
import { OrderingControl, type OrderingOption } from "../../components/OrderingControl.UI";
import { ServerRichText } from "../../components/ServerRichText.Renderer";
import { getLibraryBooksView, saveLibraryBooksView, type LibraryBooksView } from "../../storage/LibraryBooksView.Store";
import { canEditShelf, ShelfMetaLine } from "./ShelfMetadata.Presenter";
import { useShelfDetail } from "./ShelfDetail.Controller";

type ShelfItemOrdering = "position" | "title" | "author";

const SHELF_ITEM_ORDERING_OPTIONS: Array<OrderingOption<ShelfItemOrdering>> = [
  { value: "position", label: "Shelf order", icon: "format_list_numbered" },
  { value: "title", label: "Title A-Z", icon: "sort_by_alpha" },
  { value: "author", label: "Author A-Z", icon: "person" },
];

export function ShelfDetailPage({
  profile,
  spl,
  shelfId,
  selectedBookId,
  ordering: routeOrdering,
  page: routePage = 1,
  pageSize = 20,
  onUpdateRoute,
}: {
  profile: ConnectionProfile | null;
  spl: SecondPassClient | null;
  shelfId: string;
  selectedBookId?: string | null;
  ordering?: string;
  page?: number;
  pageSize?: number;
  onUpdateRoute?: (patch: { ordering?: string; page?: number; pageSize?: number }) => void;
}) {
  const ordering = SHELF_ITEM_ORDERING_OPTIONS.some((option) => option.value === routeOrdering) ? (routeOrdering as ShelfItemOrdering) : "position";
  const { canLoad, busy, error, shelf, items, nextUrl, loadMoreBusy, loadMore } = useShelfDetail({
    spl, shelfId, ordering, page: routePage, pageSize,
  });
  const [bookViewMode, setBookViewMode] = useState<LibraryBooksView>(() => getLibraryBooksView());

  const openBookDetails = useCallback(
    (bookId: string | number) => {
      navigateTo({ kind: "shelf", shelfId, bookId: String(bookId) });
    },
    [shelfId],
  );

  const handleBookViewChange = useCallback((viewMode: LibraryBooksView) => {
    setBookViewMode(viewMode);
    saveLibraryBooksView(viewMode);
  }, []);

  const shelfBooks = useMemo<CompactBook[]>(() => items.map(({ book }) => ({
    id: String(book.id),
    title: book.title,
    sortTitle: book.title,
    subtitle: "",
    authors: (book.authors ?? []).map((author) => ({ id: String(author.id), name: author.name })),
    series: book.series ? {
      id: String(book.series.id),
      name: book.series.name,
      sortName: book.series.sort_name ?? book.series.name,
      seriesIndex: book.series.series_index == null ? null : String(book.series.series_index),
    } : null,
    catalogTags: [],
    language: null,
    publisher: null,
    publishedYear: null,
    publishedMonth: null,
    publishedDay: null,
    publishedDatePrecision: "",
    coverUrl: book.cover_url ?? null,
    fileFormat: "",
  })), [items]);

  const canEditCurrentShelf = canEditShelf(shelf);

  return (
    <section className="panel shelfDetail">
      <div className="panelHeaderRow">
        <h2 className="panelTitle" style={{ margin: 0 }}>
          {shelf?.name ?? "Shelf"}
        </h2>
        <div className="shelfDetailHeaderActions">
          {canEditCurrentShelf ? (
            <button
              type="button"
              className="button buttonCompact"
              onClick={() => navigateTo({ kind: "shelfEdit", shelfId })}
            >
              Edit shelf
            </button>
          ) : null}
        </div>
      </div>

      {!canLoad ? <p className="muted">Verify the connection to view this shelf.</p> : null}
      {busy && !shelf && items.length === 0 ? <p className="muted">Loading shelf...</p> : null}
      {error ? <div className="errorText">{error}</div> : null}

      <ServerRichText value={shelf?.description} className="muted" />
      {shelf ? <div className="muted"><ShelfMetaLine shelf={shelf} /></div> : null}

      {items.length > 0 ? (
        <div className="shelfBookControls">
          <OrderingControl
            options={SHELF_ITEM_ORDERING_OPTIONS}
            value={ordering}
            onChange={(nextOrdering) => onUpdateRoute?.({ ordering: nextOrdering, page: 1, pageSize })}
            ariaLabel="Sort shelf books"
          />
          <BookViewModeToggle viewMode={bookViewMode} onChange={handleBookViewChange} />
        </div>
      ) : null}

      {items.length > 0 ? (
        <BookResultsView
          books={shelfBooks}
          viewMode={bookViewMode}
          serverBaseUrl={profile?.serverBaseUrl}
          selectedBookId={selectedBookId ? String(selectedBookId) : null}
          onViewBook={(book) => openBookDetails(book.id)}
        />
      ) : !busy && canLoad && !error ? (
        <p className="muted">No books on this shelf.</p>
      ) : null}

      {nextUrl ? (
        <div style={{ marginTop: 12 }}>
          <button type="button" className="button buttonCompact" onClick={() => void loadMore()} disabled={loadMoreBusy}>
            {loadMoreBusy ? `Loading${"\u2026"}` : "Load more"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
