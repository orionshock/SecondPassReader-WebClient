import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@secondpass/client";
import { navigateTo } from "../../app/navigation";
import type { LibraryBook, SecondPassClient, Shelf, ShelfItem } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { BookResultsView } from "../library/display/BookResultsView";
import { BookViewModeToggle } from "../library/display/BookViewModeToggle";
import { getLibraryBooksView, saveLibraryBooksView, type LibraryBooksView } from "../../storage/libraryBooksView";
import { canEditShelf, ShelfMetaLine } from "./shelfMeta";
import { saveReaderReturnTarget } from "../reader/readerReturnTarget";

export function ShelfDetailPage({
  profile,
  spl,
  shelfId,
  selectedBookId,
}: {
  profile: ConnectionProfile | null;
  spl: SecondPassClient | null;
  shelfId: string;
  selectedBookId?: string | null;
}) {
  const canLoad = Boolean(spl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [loadMoreBusy, setLoadMoreBusy] = useState(false);
  const [bookViewMode, setBookViewMode] = useState<LibraryBooksView>(() => getLibraryBooksView());

  const loadFirst = useCallback(async () => {
    if (!spl) return;
    setBusy(true);
    setError(null);
    try {
      const [s, page] = await Promise.all([
        spl.shelves.get(shelfId),
        spl.shelves.items(shelfId, { page: 1 }),
      ]);
      setShelf(s);
      const results = page.results ?? [];
      setItems(results.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
      setNextUrl(page.next ?? null);
    } catch (e) {
      const message =
        e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")
          ? "Could not load shelf. Your device token may be revoked or not allowed to access shelves."
          : e instanceof ApiError && e.status === 404
            ? "Shelf not found or not accessible."
            : e instanceof Error
              ? e.message
              : "Failed to load shelf.";
      setError(message);
      setShelf(null);
      setItems([]);
      setNextUrl(null);
    } finally {
      setBusy(false);
    }
  }, [shelfId, spl]);

  useEffect(() => {
    setShelf(null);
    setItems([]);
    setNextUrl(null);
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

    setLoadMoreBusy(true);
    setError(null);
    try {
      const page = await spl.shelves.items(shelfId, { page: nextPage });
      const results = page.results ?? [];
      setItems((prev) => {
        const merged = [...prev, ...results];
        return merged.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      });
      setNextUrl(page.next ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more items.");
    } finally {
      setLoadMoreBusy(false);
    }
  }, [loadMoreBusy, nextUrl, parseNextPage, shelfId, spl]);

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

  const shelfBooks = useMemo(() => items.map((item) => item.book as LibraryBook), [items]);
  const shelfItemByBookId = useMemo(() => {
    const next = new Map<string, ShelfItem>();
    for (const item of items) next.set(String(item.book.id), item);
    return next;
  }, [items]);

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
      {busy ? <p className="muted">{`Loading${"\u2026"}`}</p> : null}
      {error ? <div className="errorText">{error}</div> : null}

      {shelf?.description ? <div className="muted">{shelf.description}</div> : null}
      {shelf ? <div className="muted"><ShelfMetaLine shelf={shelf} /></div> : null}

      {items.length > 0 ? (
        <div className="shelfBookControls">
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
          getMetaLines={(book) => {
            const item = shelfItemByBookId.get(String(book.id));
            return typeof item?.position === "number" ? [`Position: ${item.position}`] : [];
          }}
          renderActions={(book) => (
            <div className="shelfBookActions">
              <button
                type="button"
                className="button buttonPrimary buttonCompact"
                onClick={(event) => {
                  event.stopPropagation();
                  saveReaderReturnTarget(book.id, {
                    kind: "shelf",
                    label: shelf?.name ?? "Shelf",
                    route: `#/shelves/${encodeURIComponent(shelfId)}`,
                    shelfId,
                  });
                  navigateTo({ kind: "reader", bookId: String(book.id) });
                }}
                onKeyDown={(event) => event.stopPropagation()}
              >
                Read
              </button>
            </div>
          )}
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
