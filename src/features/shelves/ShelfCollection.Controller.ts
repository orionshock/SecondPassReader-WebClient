import { useCallback, useEffect, useRef, useState } from "react";
import type { SecondPassClient, Shelf } from "@secondpass/client";
import { createPersonalShelfInput } from "./ShelfMetadata.Actions";
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

type ScopedShelves = {
  personal: Shelf[];
  shared: Shelf[];
};

export function useShelfCollection({ spl, ordering, page, pageSize }: {
  spl: SecondPassClient | null;
  ordering: "name" | "-item_count";
  page: number;
  pageSize: number;
}) {
  const canLoad = Boolean(spl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [data, setData] = useState<ScopedShelves | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<ShelfFormValues>(() => shelfToFormValues());
  const [menuShelfId, setMenuShelfId] = useState<string | null>(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const loadRequestSeq = useRef(0);
  const mutationRequestSeq = useRef(0);
  const load = useCallback(async () => {
    if (!spl) return;
    const requestSeq = ++loadRequestSeq.current;
    setBusy(true);
    setError(null);
    try {
      const [personal, shared] = await Promise.all([
        spl.shelves.list({ scope: "personal", includePreviewBooks: true, ordering, page, pageSize }),
        spl.shelves.list({ scope: "shared", includePreviewBooks: true, ordering, page, pageSize }),
      ]);
      if (requestSeq !== loadRequestSeq.current) return;
      setData({
        personal: personal.results ?? [],
        shared: shared.results ?? [],
      });
    } catch (e) {
      if (requestSeq !== loadRequestSeq.current) return;
      debugWarn("reader", "shelves could not be loaded", { error: e });
      setError(e instanceof Error ? e : new Error("Couldn't load shelves."));
    } finally {
      if (requestSeq === loadRequestSeq.current) setBusy(false);
    }
  }, [ordering, page, pageSize, spl]);

  useEffect(() => {
    setError(null);
    setBusy(false);
    setCreateOpen(false);
    setMenuShelfId(null);
    setMutationError(null);
    setMutationBusy(false);
    if (canLoad) void load();
    return () => {
      loadRequestSeq.current += 1;
      mutationRequestSeq.current += 1;
    };
  }, [canLoad, load]);

  const handleCreate = useCallback(async () => {
    if (!spl) return;
    const name = createDraft.name.trim();
    if (!name) return;
    const requestSeq = ++mutationRequestSeq.current;
    setMutationBusy(true);
    setMutationError(null);
    try {
      await spl.shelves.create(createPersonalShelfInput(createDraft));
      if (requestSeq !== mutationRequestSeq.current) return;
      setCreateOpen(false);
      setCreateDraft(shelfToFormValues());
      setMenuShelfId(null);
      await load();
    } catch (e) {
      debugWarn("reader", "shelf creation did not complete", { error: e });
      if (requestSeq !== mutationRequestSeq.current) return;
      setMutationError("Couldn't create the shelf. Try again.");
    } finally {
      if (requestSeq === mutationRequestSeq.current) setMutationBusy(false);
    }
  }, [createDraft, load, spl]);

  const handleDelete = useCallback(async (shelf: Shelf) => {
    if (!spl || !canEditShelf(shelf)) return;
    if (!window.confirm("Delete this shelf? The books on it will remain in Library.")) return;
    const requestSeq = ++mutationRequestSeq.current;
    setMutationBusy(true);
    setMutationError(null);
    try {
      await spl.shelves.remove(shelf.id);
      if (requestSeq !== mutationRequestSeq.current) return;
      setMenuShelfId(null);
      await load();
    } catch (e) {
      debugWarn("reader", "shelf deletion did not complete", { shelfId: shelf.id, error: e });
      if (requestSeq !== mutationRequestSeq.current) return;
      setMutationError("Couldn't delete the shelf. Try again.");
    } finally {
      if (requestSeq === mutationRequestSeq.current) setMutationBusy(false);
    }
  }, [load, spl]);

  const beginCreate = useCallback(() => {
    setCreateOpen(true);
    setCreateDraft(shelfToFormValues());
    setMenuShelfId(null);
    setMutationError(null);
  }, []);
  const cancelCreate = useCallback(() => {
    setCreateOpen(false);
    setMutationError(null);
  }, []);
  const toggleMenu = useCallback((shelfId: string) => {
    setMenuShelfId((current) => current === shelfId ? null : shelfId);
  }, []);
  const dismissMenu = useCallback(() => setMenuShelfId(null), []);

  return {
    canLoad, busy, error, data, createOpen, createDraft, menuShelfId, mutationBusy, mutationError,
    retry: load, createShelf: handleCreate, deleteShelf: handleDelete,
    beginCreate, cancelCreate, changeCreateDraft: setCreateDraft, toggleMenu, dismissMenu,
  };
}
