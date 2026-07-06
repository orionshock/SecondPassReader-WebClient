import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { ApiError } from "@secondpass/client";
import { navigateTo } from "../../app/navigation";
import type { SecondPassClient, Shelf, ShelfItem } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { resolveCoverUrl } from "../library/coverUtils";
import { canEditShelf, ShelfMetaLine } from "./shelfMeta";
import { saveReaderReturnTarget } from "../reader/readerReturnTarget";

function formatAuthors(item: ShelfItem): string {
  const authors = item.book.authors ?? [];
  return authors.map((a) => a.name).filter(Boolean).join(", ");
}

export function ShelfDetailPage({ profile, spl, shelfId }: { profile: ConnectionProfile | null; spl: SecondPassClient | null; shelfId: string }) {
  const canLoad = Boolean(spl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [loadMoreBusy, setLoadMoreBusy] = useState(false);

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

  const handleBookRowKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, bookId: string | number) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openBookDetails(bookId);
    },
    [openBookDetails],
  );

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

      <div className="shelfBookList">
        {items.map((it) => {
          const coverSrc = resolveCoverUrl(it.book.cover_url ?? null, profile);
          const authors = formatAuthors(it);
          const series =
            it.book.series?.name && it.book.series ? it.book.series.name : null;

          return (
            <div
              key={it.id}
              className="shelfBookCard shelfBookCardButton"
              role="button"
              tabIndex={0}
              aria-label={`View details for ${it.book.title}`}
              onClick={() => openBookDetails(it.book.id)}
              onKeyDown={(event) => handleBookRowKeyDown(event, it.book.id)}
            >
              <div className="shelfBookCover">
                {coverSrc ? (
                  <img
                    className="shelfBookCoverImg"
                    src={coverSrc}
                    alt={`${it.book.title} cover`}
                    loading="lazy"
                  />
                ) : (
                  <div className="bookCoverPlaceholderText">No cover</div>
                )}
              </div>

              <div className="shelfBookMain">
                <div className="bookTitle">{it.book.title}</div>
                {authors ? <div className="bookLine">{authors}</div> : null}
                {series ? <div className="bookLine muted">{series}</div> : null}
                {typeof it.position === "number" ? <div className="muted">Position: {it.position}</div> : null}
              </div>

              <div className="shelfBookActions">
                <button
                  type="button"
                  className="button buttonPrimary buttonCompact"
                  onClick={(event) => {
                    event.stopPropagation();
                    saveReaderReturnTarget(it.book.id, {
                      kind: "shelf",
                      label: shelf?.name ?? "Shelf",
                      route: `#/shelves/${encodeURIComponent(shelfId)}`,
                      shelfId,
                    });
                    navigateTo({ kind: "reader", bookId: String(it.book.id) });
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  Read
                </button>
              </div>
            </div>
          );
        })}
      </div>

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
