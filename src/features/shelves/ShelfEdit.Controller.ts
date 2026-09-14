import { useCallback, useEffect, useRef, useState } from "react";
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
  const identityGeneration = useRef(0);
  const loadFirstRequestSeq = useRef(0);
  const loadMoreRequestSeq = useRef(0);
  const infoRequestSeq = useRef(0);
  const itemMutationSeq = useRef(0);
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
    const requestSeq = ++loadFirstRequestSeq.current;
    loadMoreRequestSeq.current += 1;
    setLoadMoreBusy(false);
    setBusy(true);
    setError(null);
    setMutationError(null);
    try {
      const s = await spl.shelves.get(shelfId);
      if (requestSeq !== loadFirstRequestSeq.current) return;
      setShelf(s);
      setInfoDraft(shelfToFormValues(s));
      if (canEditShelf(s)) {
        const page = await spl.shelves.items(shelfId, { page: 1 });
        if (requestSeq !== loadFirstRequestSeq.current) return;
        const results = page.results ?? [];
        setItems(results.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
        setNextUrl(page.next ?? null);
      } else {
        setItems([]);
        setNextUrl(null);
      }
    } catch (e) {
      if (requestSeq !== loadFirstRequestSeq.current) return;
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
      if (requestSeq === loadFirstRequestSeq.current) setBusy(false);
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
    setLoadMoreBusy(false);
    setInfoBusy(false);
    if (canLoad) void loadFirst();
    return () => {
      identityGeneration.current += 1;
      loadFirstRequestSeq.current += 1;
      loadMoreRequestSeq.current += 1;
      infoRequestSeq.current += 1;
      itemMutationSeq.current += 1;
    };
  }, [canLoad, loadFirst]);

  const loadMore = useCallback(async () => {
    if (!spl) return;
    const nextPage = parseNextPage(nextUrl);
    if (!nextPage || loadMoreBusy) return;

    const requestSeq = ++loadMoreRequestSeq.current;
    setLoadMoreBusy(true);
    setMutationError(null);
    try {
      const page = await spl.shelves.items(shelfId, { page: nextPage });
      if (requestSeq !== loadMoreRequestSeq.current) return;
      const results = page.results ?? [];
      setItems((prev) => {
        const merged = [...prev, ...results];
        return merged.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      });
      setNextUrl(page.next ?? null);
    } catch (e) {
      if (requestSeq !== loadMoreRequestSeq.current) return;
      debugWarn("reader", "more shelf books could not be loaded", { shelfId, error: e });
      setMutationError("Couldn't load more books. Try again.");
    } finally {
      if (requestSeq === loadMoreRequestSeq.current) setLoadMoreBusy(false);
    }
  }, [loadMoreBusy, nextUrl, shelfId, spl]);

  const handleSaveInfo = useCallback(async () => {
    if (!spl) return;
    if (!canEditShelf(shelf)) return;
    const name = infoDraft.name.trim();
    if (!name) return;
    const requestSeq = ++infoRequestSeq.current;
    setInfoBusy(true);
    setMutationError(null);
    try {
      const updatedShelf = await spl.shelves.update(shelfId, updatePersonalShelfInput(infoDraft));
      if (requestSeq !== infoRequestSeq.current) return;
      setShelf(updatedShelf);
      setInfoDraft(shelfToFormValues(updatedShelf));
      setInfoOpen(false);
    } catch (e) {
      debugWarn("reader", "shelf details were not saved", { shelfId, error: e });
      if (requestSeq !== infoRequestSeq.current) return;
      setMutationError("Couldn't save the shelf. Try again.");
    } finally {
      if (requestSeq === infoRequestSeq.current) setInfoBusy(false);
    }
  }, [infoDraft, shelf, shelfId, spl]);

  const handleMoveToPosition = useCallback(async (item: ShelfItem, position: number) => {
    if (!spl) return;
    if (!canEditShelf(shelf)) return;
    const generation = identityGeneration.current;
    const requestSeq = ++itemMutationSeq.current;
    setMutationBusyId(item.id);
    setMutationError(null);
    try {
      await spl.shelves.updateItem(shelfId, item.id, { position });
      // The mutation targeted the captured Shelf. Only refresh if that identity is still mounted.
      if (generation !== identityGeneration.current) return;
      await loadFirst();
    } catch (e) {
      debugWarn("reader", "Book shelf position was not saved", { shelfId, bookId: item.book.id, error: e });
      if (requestSeq !== itemMutationSeq.current) return;
      setMutationError("Couldn't move the Book. Try again.");
    } finally {
      if (requestSeq === itemMutationSeq.current) setMutationBusyId(null);
    }
  }, [loadFirst, shelf, shelfId, spl]);

  const handleMoveItem = useCallback(async (item: ShelfItem, move: "up" | "down") => {
    if (!spl) return;
    if (!canEditShelf(shelf)) return;
    const generation = identityGeneration.current;
    const requestSeq = ++itemMutationSeq.current;
    setMutationBusyId(item.id);
    setMutationError(null);
    try {
      await spl.shelves.updateItem(shelfId, item.id, { move });
      // The mutation targeted the captured Shelf. Only refresh if that identity is still mounted.
      if (generation !== identityGeneration.current) return;
      await loadFirst();
    } catch (e) {
      debugWarn("reader", "Book shelf order was not saved", { shelfId, bookId: item.book.id, move, error: e });
      if (requestSeq !== itemMutationSeq.current) return;
      setMutationError("Couldn't move the Book. Try again.");
    } finally {
      if (requestSeq === itemMutationSeq.current) setMutationBusyId(null);
    }
  }, [loadFirst, shelf, shelfId, spl]);

  const handleRemoveItem = useCallback(async (item: ShelfItem) => {
    if (!spl) return;
    if (!canEditShelf(shelf)) return;
    if (!window.confirm("Remove this book from the shelf? The book will remain in Library.")) return;
    const generation = identityGeneration.current;
    const requestSeq = ++itemMutationSeq.current;
    setMutationBusyId(item.id);
    setMutationError(null);
    try {
      await spl.shelves.removeItem(shelfId, item.id);
      // The mutation targeted the captured Shelf. Only refresh if that identity is still mounted.
      if (generation !== identityGeneration.current) return;
      await loadFirst();
    } catch (e) {
      debugWarn("reader", "Book was not removed from shelf", { shelfId, bookId: item.book.id, error: e });
      if (requestSeq !== itemMutationSeq.current) return;
      setMutationError("Couldn't remove the Book from the shelf. Try again.");
    } finally {
      if (requestSeq === itemMutationSeq.current) setMutationBusyId(null);
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
