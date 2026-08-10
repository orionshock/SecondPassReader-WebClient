import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@secondpass/client";
import { navigateTo } from "../../app/AppNavigation.Router";
import type { CompactBook, SecondPassClient, Shelf, ShelfItem } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { BookResultsView } from "../library/display/BookResultsView";
import { BookViewModeToggle } from "../library/display/BookViewModeToggle";
import { OrderingControl, type OrderingOption } from "../../components/OrderingControl";
import { getLibraryBooksView, saveLibraryBooksView, type LibraryBooksView } from "../../storage/libraryBooksView";
import { canEditShelf, ShelfMetaLine } from "./shelfMeta";

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
  const canLoad = Boolean(spl);
  const ordering = SHELF_ITEM_ORDERING_OPTIONS.some((option) => option.value === routeOrdering) ? (routeOrdering as ShelfItemOrdering) : "position";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [loadMoreBusy, setLoadMoreBusy] = useState(false);
  const [bookViewMode, setBookViewMode] = useState<LibraryBooksView>(() => getLibraryBooksView());
  const loadFirstRequestSeq = useRef(0);
  const loadMoreRequestSeq = useRef(0);

  const loadFirst = useCallback(async () => {
    if (!spl) return;
    const requestSeq = ++loadFirstRequestSeq.current;
    loadMoreRequestSeq.current += 1;
    setBusy(true);
    setError(null);
    try {
      const [s, page] = await Promise.all([
        spl.shelves.get(shelfId),
        spl.shelves.items(shelfId, { page: routePage, pageSize, ordering }),
      ]);
      if (requestSeq !== loadFirstRequestSeq.current) return;
      setShelf(s);
      const results = page.results ?? [];
      setItems(results);
      setNextUrl(page.next ?? null);
    } catch (e) {
      if (requestSeq !== loadFirstRequestSeq.current) return;
      const message =
        e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")
          ? "Could not load shelf. Your device token may be revoked or not allowed to access shelves."
          : e instanceof ApiError && e.status === 404
            ? "Shelf not found or not accessible."
            : e instanceof Error
              ? e.message
              : "Failed to load shelf.";
      setError(message);
    } finally {
      if (requestSeq === loadFirstRequestSeq.current) setBusy(false);
    }
  }, [ordering, routePage, pageSize, shelfId, spl]);

  useEffect(() => {
    setError(null);
    setBusy(false);
    if (!canLoad) return;
    void loadFirst();
  }, [canLoad, loadFirst]);

  const parseNextPage = useCallback((url: string | null): number | null => {
    if (!url) return null;
    try {
      const u = new URL(url);
      const pageRaw = u.searchParams.get("page");
      if (!pageRaw) return null;
      const page = Number(pageRaw);
      return Number.isFinite(page) && page > 0 ? page : null;
    } catch {
      return null;
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!spl) return;
    if (!nextUrl) return;
    const nextPage = parseNextPage(nextUrl);
    if (!nextPage) return;
    if (loadMoreBusy) return;

    const requestSeq = ++loadMoreRequestSeq.current;
    setLoadMoreBusy(true);
    setError(null);
    try {
      const pageResult = await spl.shelves.items(shelfId, { page: nextPage, pageSize, ordering });
      if (requestSeq !== loadMoreRequestSeq.current) return;
      const results = pageResult.results ?? [];
      setItems((prev) => {
        return [...prev, ...results];
      });
      setNextUrl(pageResult.next ?? null);
    } catch (e) {
      if (requestSeq !== loadMoreRequestSeq.current) return;
      setError(e instanceof Error ? e.message : "Failed to load more items.");
    } finally {
      if (requestSeq === loadMoreRequestSeq.current) setLoadMoreBusy(false);
    }
  }, [loadMoreBusy, nextUrl, ordering, pageSize, parseNextPage, shelfId, spl]);

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

      {!canLoad ? <p className="muted">Select a verified profile first.</p> : null}
      {busy && !shelf && items.length === 0 ? <p className="muted">{`Loading${"\u2026"}`}</p> : null}
      {error ? <div className="errorText">{error}</div> : null}

      {shelf?.description ? <div className="muted">{shelf.description}</div> : null}
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
