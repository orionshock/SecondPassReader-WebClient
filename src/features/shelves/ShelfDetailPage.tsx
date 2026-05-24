import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, SecondPassApiClient } from "../../api/SecondPassApiClient";
import { navigateTo } from "../../app/navigation";
import type { Shelf, ShelfItem } from "../../schemas/shelves";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { resolveCoverUrl } from "../library/coverUtils";

function formatAuthors(item: ShelfItem): string {
  const authors = item.book.authors ?? [];
  return authors.map((a) => a.name).filter(Boolean).join(", ");
}

export function ShelfDetailPage({ profile, shelfId }: { profile: ConnectionProfile | null; shelfId: string }) {
  const canLoad = Boolean(profile?.apiBaseUrl && profile?.accessToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [loadMoreBusy, setLoadMoreBusy] = useState(false);

  const loadFirst = useCallback(async () => {
    if (!profile?.apiBaseUrl || !profile.accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const api = new SecondPassApiClient({ serverBaseUrl: profile.serverBaseUrl });
      const [s, page] = await Promise.all([
        api.getShelf({
          apiBaseUrl: profile.apiBaseUrl,
          accessToken: profile.accessToken,
          tokenType: profile.tokenType ?? "Bearer",
          shelfId,
        }),
        api.listShelfItems({
          apiBaseUrl: profile.apiBaseUrl,
          accessToken: profile.accessToken,
          tokenType: profile.tokenType ?? "Bearer",
          shelfId,
          page: 1,
        }),
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
  }, [profile, shelfId]);

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
    if (!profile?.apiBaseUrl || !profile.accessToken) return;
    if (!nextUrl) return;
    const nextPage = parseNextPage(nextUrl);
    if (!nextPage) return;
    if (loadMoreBusy) return;

    setLoadMoreBusy(true);
    setError(null);
    try {
      const api = new SecondPassApiClient({ serverBaseUrl: profile.serverBaseUrl });
      const page = await api.listShelfItems({
        apiBaseUrl: profile.apiBaseUrl,
        accessToken: profile.accessToken,
        tokenType: profile.tokenType ?? "Bearer",
        shelfId,
        page: nextPage,
      });
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
  }, [loadMoreBusy, nextUrl, parseNextPage, profile, shelfId]);

  const headerMeta = useMemo(() => {
    if (!shelf) return "";
    const parts: string[] = [];
    if (shelf.owner_type === "group" && shelf.owner_group?.name) parts.push(`Group: ${shelf.owner_group.name}`);
    if (shelf.owner_type === "user") parts.push((shelf.visibility ?? "private").toString());
    if (typeof shelf.item_count === "number") parts.push(`${shelf.item_count} items`);
    return parts.filter(Boolean).join(" · ");
  }, [shelf]);

  return (
    <section className="panel shelfDetail">
      <div className="panelHeaderRow">
        <h2 className="panelTitle" style={{ margin: 0 }}>
          {shelf?.name ?? "Shelf"}
        </h2>
        <button type="button" className="button buttonCompact" onClick={() => navigateTo({ kind: "shelves" })}>
          All shelves
        </button>
      </div>

      {!canLoad ? <p className="muted">Select a verified profile first.</p> : null}
      {busy ? <p className="muted">Loading…</p> : null}
      {error ? <div className="errorText">{error}</div> : null}

      {shelf?.description ? <div className="muted">{shelf.description}</div> : null}
      {headerMeta ? <div className="muted">{headerMeta}</div> : null}

      <div className="shelfBookList">
        {items.map((it) => {
          const coverSrc = resolveCoverUrl(it.book.cover_url ?? null, profile);
          const authors = formatAuthors(it);
          const series =
            it.book.series?.name && it.book.series ? it.book.series.name : null;

          return (
            <div key={it.id} className="shelfBookCard">
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
                  className="button buttonCompact"
                  onClick={() => navigateTo({ kind: "shelf", shelfId, bookId: String(it.book.id) })}
                >
                  View details
                </button>
                <button
                  type="button"
                  className="button buttonPrimary buttonCompact"
                  onClick={() => navigateTo({ kind: "reader", bookId: String(it.book.id) })}
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
            {loadMoreBusy ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
