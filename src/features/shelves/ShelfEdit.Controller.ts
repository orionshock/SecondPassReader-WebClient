import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@secondpass/client";
import type { SecondPassClient, Shelf, ShelfItem } from "@secondpass/client";
import { updatePersonalShelfInput } from "./ShelfMetadata.Actions";
import type { ShelfFormValues } from "./ShelfForm.Types";
import { canEditShelf } from "./ShelfMetadata.Presenter";
import { debugWarn } from "../../lib/debug/DebugLogger.Diagnostics";

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

export function useShelfEdit({ spl, shelfId }: { spl: SecondPassClient | null; shelfId: string }) {
  const canLoad = Boolean(spl);
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
    if (!spl) return;
    setBusy(true);
    setError(null);
    setMutationError(null);
    try {
      const s = await spl.shelves.get(shelfId);
      setShelf(s);
      setInfoDraft(shelfToFormValues(s));
      if (canEditShelf(s)) {
        const page = await spl.shelves.items(shelfId, { page: 1 });
        const results = page.results ?? [];
        setItems(results.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
        setNextUrl(page.next ?? null);
      } else {
        setItems([]);
        setNextUrl(null);
      }
    } catch (e) {
      debugWarn("reader", "shelf edit data could not be loaded", { shelfId, error: e });
      const message =
        e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")
          ? "This account can't access this shelf. Check the connection and try again."
          : e instanceof ApiError && e.status === 404
            ? "Shelf not found or unavailable to this account."
            : "Couldn't load the shelf. Reload the page to try again.";
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
    setMutationError(null);
    setInfoOpen(false);
    setBusy(false);
    setMutationBusyId(null);
    if (!canLoad) return;
    void loadFirst();
  }, [canLoad, loadFirst]);

  const loadMore = useCallback(async () => {
    if (!spl) return;
    const nextPage = parseNextPage(nextUrl);
    if (!nextPage || loadMoreBusy) return;

    setLoadMoreBusy(true);
    setMutationError(null);
    try {
      const page = await spl.shelves.items(shelfId, { page: nextPage });
      const results = page.results ?? [];
      setItems((prev) => {
        const merged = [...prev, ...results];
        return merged.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      });
      setNextUrl(page.next ?? null);
    } catch (e) {
      debugWarn("reader", "more shelf books could not be loaded", { shelfId, error: e });
      setMutationError("Couldn't load more books. Try again.");
    } finally {
      setLoadMoreBusy(false);
    }
  }, [loadMoreBusy, nextUrl, shelfId, spl]);

  const handleSaveInfo = useCallback(async () => {
    if (!spl) return;
    if (!canEditShelf(shelf)) return;
    const name = infoDraft.name.trim();
    if (!name) return;
    setInfoBusy(true);
    setMutationError(null);
    try {
      const updatedShelf = await spl.shelves.update(shelfId, updatePersonalShelfInput(infoDraft));
      setShelf(updatedShelf);
      setInfoDraft(shelfToFormValues(updatedShelf));
      setInfoOpen(false);
    } catch (e) {
      debugWarn("reader", "shelf details were not saved", { shelfId, error: e });
      setMutationError("Couldn't save the shelf. Try again.");
    } finally {
      setInfoBusy(false);
    }
  }, [infoDraft, shelf, shelfId, spl]);

  const handleMoveToPosition = useCallback(async (item: ShelfItem, position: number) => {
    if (!spl) return;
    if (!canEditShelf(shelf)) return;
    setMutationBusyId(item.id);
    setMutationError(null);
    try {
      await spl.shelves.updateItem(shelfId, item.id, { position });
      await loadFirst();
    } catch (e) {
      debugWarn("reader", "Book shelf position was not saved", { shelfId, bookId: item.book.id, error: e });
      setMutationError("Couldn't move the Book. Try again.");
    } finally {
      setMutationBusyId(null);
    }
  }, [loadFirst, shelf, shelfId, spl]);

  const handleMoveItem = useCallback(async (item: ShelfItem, move: "up" | "down") => {
    if (!spl) return;
    if (!canEditShelf(shelf)) return;
    setMutationBusyId(item.id);
    setMutationError(null);
    try {
      await spl.shelves.updateItem(shelfId, item.id, { move });
      await loadFirst();
    } catch (e) {
      debugWarn("reader", "Book shelf order was not saved", { shelfId, bookId: item.book.id, move, error: e });
      setMutationError("Couldn't move the Book. Try again.");
    } finally {
      setMutationBusyId(null);
    }
  }, [loadFirst, shelf, shelfId, spl]);

  const handleRemoveItem = useCallback(async (item: ShelfItem) => {
    if (!spl) return;
    if (!canEditShelf(shelf)) return;
    if (!window.confirm("Remove this book from the shelf? The book will remain in Library.")) return;
    setMutationBusyId(item.id);
    setMutationError(null);
    try {
      await spl.shelves.removeItem(shelfId, item.id);
      await loadFirst();
    } catch (e) {
      debugWarn("reader", "Book was not removed from shelf", { shelfId, bookId: item.book.id, error: e });
      setMutationError("Couldn't remove the Book from the shelf. Try again.");
    } finally {
      setMutationBusyId(null);
    }
  }, [loadFirst, shelf, shelfId, spl]);

  const canEdit = canEditShelf(shelf);
  const editInfo = useCallback(() => {
    setInfoDraft(shelfToFormValues(shelf));
    setInfoOpen(true);
    setMutationError(null);
  }, [shelf]);
  const cancelInfo = useCallback(() => {
    setInfoOpen(false);
    setMutationError(null);
  }, []);

  return {
    canLoad, busy, error, shelf, items, nextUrl, loadMoreBusy,
    mutationBusyId, mutationError, infoOpen, infoDraft, infoBusy, canEdit,
    loadMore, editInfo, cancelInfo, changeInfo: setInfoDraft,
    saveInfo: handleSaveInfo, moveToPosition: handleMoveToPosition,
    moveItem: handleMoveItem, removeItem: handleRemoveItem,
  };
}
