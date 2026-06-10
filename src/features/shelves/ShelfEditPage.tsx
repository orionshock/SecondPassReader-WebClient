import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@secondpass/client";
import type { Shelf, ShelfItem } from "@secondpass/client";
import { navigateTo } from "../../app/navigation";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { InlineMeta } from "../../components/MetaSeparator";
import { MaterialIcon } from "../../components/MaterialIcon";
import { createSplClientFromProfile } from "../../app/createSplClient";
import { resolveCoverUrl } from "../library/coverUtils";
import { ShelfForm, type ShelfFormValues } from "./ShelfForm";

function formatAuthors(item: ShelfItem): string {
  const authors = item.book.authors ?? [];
  return authors.map((a) => a.name).filter(Boolean).join(", ");
}

function canEditPersonalShelf(shelf: Shelf | null): boolean {
  return shelf?.owner_type === "user" && shelf.can_edit === true;
}

function shelfToFormValues(shelf?: Shelf | null): ShelfFormValues {
  return {
    name: shelf?.name ?? "",
    description: shelf?.description ?? "",
    visibility: shelf?.visibility === "listed" ? "listed" : "private",
  };
}

function parseNextPage(url: string | null): number | null {
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
}

export function ShelfEditPage({ profile, shelfId }: { profile: ConnectionProfile | null; shelfId: string }) {
  const canLoad = Boolean(profile?.apiBaseUrl && profile?.accessToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [loadMoreBusy, setLoadMoreBusy] = useState(false);
  const [mutationBusyId, setMutationBusyId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoDraft, setInfoDraft] = useState<ShelfFormValues>(() => shelfToFormValues());
  const [infoBusy, setInfoBusy] = useState(false);

  const loadFirst = useCallback(async () => {
    if (!profile?.apiBaseUrl || !profile.accessToken) return;
    setBusy(true);
    setError(null);
    setMutationError(null);
    try {
      const spl = createSplClientFromProfile(profile);
      const [s, page] = await Promise.all([
        spl.shelves.get(shelfId),
        spl.shelves.items(shelfId, { page: 1 }),
      ]);
      setShelf(s);
      setInfoDraft(shelfToFormValues(s));
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
    setMutationError(null);
    setInfoOpen(false);
    setBusy(false);
    setMutationBusyId(null);
    if (!canLoad) return;
    void loadFirst();
  }, [canLoad, loadFirst]);

  const loadMore = useCallback(async () => {
    if (!profile?.apiBaseUrl || !profile.accessToken) return;
    const nextPage = parseNextPage(nextUrl);
    if (!nextPage || loadMoreBusy) return;

    setLoadMoreBusy(true);
    setMutationError(null);
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
      setMutationError(e instanceof Error ? e.message : "Failed to load more items.");
    } finally {
      setLoadMoreBusy(false);
    }
  }, [loadMoreBusy, nextUrl, profile, shelfId]);

  const handleSaveInfo = useCallback(async () => {
    if (!profile?.apiBaseUrl || !profile.accessToken) return;
    if (!canEditPersonalShelf(shelf)) return;
    const name = infoDraft.name.trim();
    if (!name) return;
    setInfoBusy(true);
    setMutationError(null);
    try {
      const spl = createSplClientFromProfile(profile);
      await spl.shelves.update(shelfId, {
        name,
        description: infoDraft.description.trim(),
        visibility: infoDraft.visibility,
      });
      setInfoOpen(false);
      await loadFirst();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : "Failed to update shelf.");
    } finally {
      setInfoBusy(false);
    }
  }, [infoDraft, loadFirst, profile, shelf, shelfId]);

  const handleMoveToPosition = useCallback(async (item: ShelfItem, position: number) => {
    if (!profile?.apiBaseUrl || !profile.accessToken) return;
    if (!canEditPersonalShelf(shelf)) return;
    setMutationBusyId(item.id);
    setMutationError(null);
    try {
      const spl = createSplClientFromProfile(profile);
      await spl.shelves.updateItem(shelfId, item.id, { position });
      await loadFirst();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : "Failed to move shelf item.");
    } finally {
      setMutationBusyId(null);
    }
  }, [loadFirst, profile, shelf, shelfId]);

  const handleMoveItem = useCallback(async (item: ShelfItem, move: "up" | "down") => {
    if (!profile?.apiBaseUrl || !profile.accessToken) return;
    if (!canEditPersonalShelf(shelf)) return;
    setMutationBusyId(item.id);
    setMutationError(null);
    try {
      const spl = createSplClientFromProfile(profile);
      await spl.shelves.updateItem(shelfId, item.id, { move });
      await loadFirst();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : "Failed to move shelf item.");
    } finally {
      setMutationBusyId(null);
    }
  }, [loadFirst, profile, shelf, shelfId]);

  const handleRemoveItem = useCallback(async (item: ShelfItem) => {
    if (!profile?.apiBaseUrl || !profile.accessToken) return;
    if (!canEditPersonalShelf(shelf)) return;
    if (!window.confirm("Remove this book from the shelf? The book itself will not be deleted.")) return;
    setMutationBusyId(item.id);
    setMutationError(null);
    try {
      const spl = createSplClientFromProfile(profile);
      await spl.shelves.removeItem(shelfId, item.id);
      await loadFirst();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : "Failed to remove shelf item.");
    } finally {
      setMutationBusyId(null);
    }
  }, [loadFirst, profile, shelf, shelfId]);

  const canEdit = canEditPersonalShelf(shelf);
  const itemCount = typeof shelf?.item_count === "number" ? Math.max(0, Math.floor(shelf.item_count)) : items.length;
  const positionOptions = useMemo(() => Array.from({ length: itemCount }, (_unused, index) => index), [itemCount]);
  const headerMeta = useMemo(() => {
    if (!shelf) return [];
    return [
      shelf.visibility ? shelf.visibility.toString() : "private",
      typeof shelf.item_count === "number" ? `${shelf.item_count} items` : null,
    ];
  }, [shelf]);

  return (
    <section className="panel shelfDetail shelfEditPage">
      <div className="panelHeaderRow">
        <h2 className="panelTitle" style={{ margin: 0 }}>
          {shelf?.name ? `Editing ${shelf.name}` : "Editing shelf"}
        </h2>
        <div className="shelfDetailHeaderActions">
          <button type="button" className="button buttonPrimary buttonCompact" onClick={() => navigateTo({ kind: "shelf", shelfId })}>
            <MaterialIcon name="done" />
            Done
          </button>
          <button type="button" className="button buttonCompact" onClick={() => navigateTo({ kind: "shelves" })}>
            All shelves
          </button>
        </div>
      </div>

      {!canLoad ? <p className="muted">Select a verified profile first.</p> : null}
      {busy ? <p className="muted">{`Loading${"\u2026"}`}</p> : null}
      {error ? <div className="errorText">{error}</div> : null}
      {mutationError ? <div className="errorText">{mutationError}</div> : null}

      {shelf ? (
        <>
          <div className="shelfEditSummary">
            <div className="muted">
              <InlineMeta items={headerMeta} />
            </div>
            {shelf.description ? <div className="muted">{shelf.description}</div> : null}
            {canEdit ? (
              <button
                type="button"
                className="button buttonCompact"
                onClick={() => {
                  setInfoDraft(shelfToFormValues(shelf));
                  setInfoOpen(true);
                  setMutationError(null);
                }}
              >
                Change shelf info
              </button>
            ) : (
              <div className="muted">This shelf is read-only.</div>
            )}
          </div>

          {canEdit ? (
            <div className="shelfBookList">
              {items.map((it, index) => {
                const coverSrc = resolveCoverUrl(it.book.cover_url ?? null, profile);
                const authors = formatAuthors(it);
                const series = it.book.series?.name && it.book.series ? it.book.series.name : null;
                const itemBusy = mutationBusyId === it.id;
                const currentPosition = typeof it.position === "number" ? it.position : index;

                return (
                  <div key={it.id} className="shelfBookCard shelfEditBookCard">
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
                    </div>

                    <div className="shelfEditItemActions">
                      <button
                        type="button"
                        className="button buttonCompact shelfIconButton"
                        onClick={() => void handleMoveItem(it, "up")}
                        disabled={itemBusy || index === 0}
                        aria-label="Move up"
                        title="Move up"
                      >
                        <MaterialIcon name="keyboard_arrow_up" />
                      </button>
                      <button
                        type="button"
                        className="button buttonCompact shelfIconButton"
                        onClick={() => void handleMoveItem(it, "down")}
                        disabled={itemBusy || index === items.length - 1}
                        aria-label="Move down"
                        title="Move down"
                      >
                        <MaterialIcon name="keyboard_arrow_down" />
                      </button>
                      <label className="shelfMoveSelectLabel">
                        <span className="fieldLabel">Move to index</span>
                        <select
                          className="input inputCompact shelfMoveSelect"
                          value={String(currentPosition)}
                          onChange={(e) => {
                            const next = Number(e.target.value);
                            if (Number.isInteger(next) && next >= 0 && next < itemCount && next !== currentPosition) {
                              void handleMoveToPosition(it, next);
                            }
                          }}
                          disabled={itemBusy || itemCount <= 1}
                        >
                          {positionOptions.map((position) => (
                            <option key={position} value={position}>
                              {position}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="button buttonCompact shelfIconButton shelfRemoveIconButton"
                        onClick={() => void handleRemoveItem(it)}
                        disabled={itemBusy}
                        aria-label="Remove from shelf"
                        title="Remove from shelf"
                      >
                        <MaterialIcon name="delete" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {nextUrl && canEdit ? (
            <div style={{ marginTop: 12 }}>
              <button type="button" className="button buttonCompact" onClick={() => void loadMore()} disabled={loadMoreBusy}>
                {loadMoreBusy ? `Loading${"\u2026"}` : "Load more"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {infoOpen && canEdit ? (
        <div
          className="modalOverlay shelfModalOverlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !infoBusy) {
              setInfoOpen(false);
              setMutationError(null);
            }
          }}
        >
          <section className="modalPanel shelfModalPanel" role="dialog" aria-modal="true" aria-labelledby="shelf-info-title">
            <div className="modalHeaderRow">
              <div className="modalTitle" id="shelf-info-title">
                Change shelf info
              </div>
              <button
                type="button"
                className="button buttonCompact shelfIconButton"
                onClick={() => {
                  setInfoOpen(false);
                  setMutationError(null);
                }}
                disabled={infoBusy}
                aria-label="Close"
                title="Close"
              >
                <MaterialIcon name="close" />
              </button>
            </div>
            <div className="modalBody">
              <ShelfForm
                values={infoDraft}
                onChange={setInfoDraft}
                onSubmit={() => void handleSaveInfo()}
                onCancel={() => {
                  setInfoOpen(false);
                  setMutationError(null);
                }}
                submitLabel="Save shelf"
                busy={infoBusy}
              />
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
