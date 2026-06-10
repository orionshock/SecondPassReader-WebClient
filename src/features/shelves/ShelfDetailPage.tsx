import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@secondpass/client";
import { navigateTo } from "../../app/navigation";
import type { Shelf, ShelfItem } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { resolveCoverUrl } from "../library/coverUtils";
import { createSplClientFromProfile } from "../../app/createSplClient";
import { InlineMeta } from "../../components/MetaSeparator";
import { MaterialIcon } from "../../components/MaterialIcon";

function formatAuthors(item: ShelfItem): string {
  const authors = item.book.authors ?? [];
  return authors.map((a) => a.name).filter(Boolean).join(", ");
}

function canEditPersonalShelf(shelf: Shelf | null): boolean {
  return shelf?.owner_type === "user" && shelf.can_edit === true;
}

export function ShelfDetailPage({ profile, shelfId }: { profile: ConnectionProfile | null; shelfId: string }) {
  const canLoad = Boolean(profile?.apiBaseUrl && profile?.accessToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [loadMoreBusy, setLoadMoreBusy] = useState(false);
  const [itemBusyId, setItemBusyId] = useState<string | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  const loadFirst = useCallback(async () => {
    if (!profile?.apiBaseUrl || !profile.accessToken) return;
    setBusy(true);
    setError(null);
    setItemError(null);
    try {
      const spl = createSplClientFromProfile(profile);
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
  }, [profile, shelfId]);

  useEffect(() => {
    setShelf(null);
    setItems([]);
    setNextUrl(null);
    setError(null);
    setItemError(null);
    setBusy(false);
    setItemBusyId(null);
    setEditMode(false);
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
      const spl = createSplClientFromProfile(profile);
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
  }, [loadMoreBusy, nextUrl, parseNextPage, profile, shelfId]);

  const headerMeta = useMemo(() => {
    if (!shelf) return [];
    const parts: string[] = [];
    if (shelf.owner_type === "group" && shelf.owner_group?.name) parts.push(`Group: ${shelf.owner_group.name}`);
    if (shelf.owner_type === "user") parts.push((shelf.visibility ?? "private").toString());
    if (typeof shelf.item_count === "number") parts.push(`${shelf.item_count} items`);
    return parts.filter(Boolean);
  }, [shelf]);

  const canEditShelf = canEditPersonalShelf(shelf);

  useEffect(() => {
    if (!canEditShelf) setEditMode(false);
  }, [canEditShelf]);

  const handleMoveItem = useCallback(async (item: ShelfItem, move: "up" | "down") => {
    if (!profile?.apiBaseUrl || !profile.accessToken) return;
    if (!canEditPersonalShelf(shelf)) return;
    setItemBusyId(item.id);
    setItemError(null);
    try {
      const spl = createSplClientFromProfile(profile);
      await spl.shelves.updateItem(shelfId, item.id, { move });
      await loadFirst();
    } catch (e) {
      setItemError(e instanceof Error ? e.message : "Failed to update shelf item.");
    } finally {
      setItemBusyId(null);
    }
  }, [loadFirst, profile, shelf, shelfId]);

  const handleRemoveItem = useCallback(async (item: ShelfItem) => {
    if (!profile?.apiBaseUrl || !profile.accessToken) return;
    if (!canEditPersonalShelf(shelf)) return;
    if (!window.confirm("Remove this book from the shelf? The book itself will not be deleted.")) return;
    setItemBusyId(item.id);
    setItemError(null);
    try {
      const spl = createSplClientFromProfile(profile);
      await spl.shelves.removeItem(shelfId, item.id);
      await loadFirst();
    } catch (e) {
      setItemError(e instanceof Error ? e.message : "Failed to remove shelf item.");
    } finally {
      setItemBusyId(null);
    }
  }, [loadFirst, profile, shelf, shelfId]);

  return (
    <section className="panel shelfDetail">
      <div className="panelHeaderRow">
        <h2 className="panelTitle" style={{ margin: 0 }}>
          {editMode && shelf?.name ? `Editing ${shelf.name}` : shelf?.name ?? "Shelf"}
        </h2>
        <div className="shelfDetailHeaderActions">
          {canEditShelf ? (
            <button
              type="button"
              className={editMode ? "button buttonPrimary buttonCompact" : "button buttonCompact"}
              onClick={() => {
                setEditMode((current) => !current);
                setItemError(null);
              }}
            >
              <MaterialIcon name={editMode ? "done" : "edit"} />
              {editMode ? "Done" : "Edit shelf"}
            </button>
          ) : null}
          <button type="button" className="button buttonCompact" onClick={() => navigateTo({ kind: "shelves" })}>
            All shelves
          </button>
        </div>
      </div>

      {!canLoad ? <p className="muted">Select a verified profile first.</p> : null}
      {busy ? <p className="muted">{`Loading${"\u2026"}`}</p> : null}
      {error ? <div className="errorText">{error}</div> : null}
      {itemError ? <div className="errorText">{itemError}</div> : null}

      {shelf?.description ? <div className="muted">{shelf.description}</div> : null}
      {headerMeta.length ? <div className="muted"><InlineMeta items={headerMeta} /></div> : null}
      {editMode ? (
        <div className="shelfEditingBanner">
          Shelf editing is on. Reorder or remove books from this shelf.
        </div>
      ) : null}

      <div className="shelfBookList">
        {items.map((it, index) => {
          const coverSrc = resolveCoverUrl(it.book.cover_url ?? null, profile);
          const authors = formatAuthors(it);
          const series =
            it.book.series?.name && it.book.series ? it.book.series.name : null;
          const itemBusy = itemBusyId === it.id;

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
                {canEditShelf && editMode ? (
                  <div className="shelfItemEditControls">
                    <button
                      type="button"
                      className="button buttonCompact shelfIconButton"
                      onClick={() => void handleMoveItem(it, "up")}
                      disabled={itemBusy || index === 0}
                      aria-label={`Move ${it.book.title} up`}
                      title="Move up"
                    >
                      <MaterialIcon name="keyboard_arrow_up" />
                    </button>
                    <button
                      type="button"
                      className="button buttonCompact shelfIconButton"
                      onClick={() => void handleMoveItem(it, "down")}
                      disabled={itemBusy || index === items.length - 1}
                      aria-label={`Move ${it.book.title} down`}
                      title="Move down"
                    >
                      <MaterialIcon name="keyboard_arrow_down" />
                    </button>
                    <button
                      type="button"
                      className="button buttonCompact shelfIconButton"
                      onClick={() => void handleRemoveItem(it)}
                      disabled={itemBusy}
                      aria-label={`Remove ${it.book.title} from shelf`}
                      title="Remove"
                    >
                      <MaterialIcon name="delete" />
                    </button>
                  </div>
                ) : null}
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
            {loadMoreBusy ? `Loading${"\u2026"}` : "Load more"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
