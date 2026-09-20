import { useCallback, useEffect, useRef, useState } from "react";
import type { PaginatedShelfResponse, SecondPassClient, Shelf } from "@secondpass/client";
import { DEFAULT_APP_PAGE_SIZE } from "../../app/AppNavigation.Constants";
import { createPersonalShelfInput } from "./ShelfMetadata.Actions";
import type { ShelfFormValues } from "./ShelfForm.Types";
import { canEditShelf } from "./ShelfMetadata.Presenter";
import { debugWarn } from "../../lib/debug/DebugLogger.Diagnostics";

const SHELF_PREVIEW_LIMIT = 24;

function shelfToFormValues(shelf?: Shelf | null): ShelfFormValues {
  return {
    name: shelf?.name ?? "",
    description: shelf?.description ?? "",
    visibility: shelf?.visibility === "listed" ? "listed" : "private",
  };
}

type ShelfPageState = {
  page: number;
  requestedPage: number;
  data: PaginatedShelfResponse | null;
  busy: boolean;
  error: unknown;
};

const initialPageState = (): ShelfPageState => ({ page: 1, requestedPage: 1, data: null, busy: false, error: null });

function useShelfPage(scope: "personal" | "shared", spl: SecondPassClient | null, ordering: "name" | "-item_count") {
  const [state, setState] = useState<ShelfPageState>(initialPageState);
  const requestSeq = useRef(0);
  const load = useCallback(async (targetPage: number) => {
    if (!spl) return;
    const request = ++requestSeq.current;
    setState((current) => ({ ...current, requestedPage: targetPage, busy: true, error: null }));
    try {
      const result = await spl.shelves.list({
        scope, ordering, page: targetPage, pageSize: DEFAULT_APP_PAGE_SIZE,
        includePreviewBooks: true, previewLimit: SHELF_PREVIEW_LIMIT,
      });
      if (request !== requestSeq.current) return;
      const lastPage = Math.max(1, Math.ceil(result.count / DEFAULT_APP_PAGE_SIZE));
      if (targetPage > lastPage && result.results.length === 0) {
        await load(lastPage);
        return;
      }
      setState({ page: targetPage, requestedPage: targetPage, data: result, busy: false, error: null });
    } catch (error) {
      if (request !== requestSeq.current) return;
      debugWarn("reader", "shelf page could not be loaded", { scope, page: targetPage, error });
      setState((current) => ({ ...current, busy: false, error }));
    }
  }, [spl, scope, ordering]);

  useEffect(() => {
    requestSeq.current += 1;
    setState(initialPageState());
    if (spl) void load(1);
    return () => { requestSeq.current += 1; };
  }, [load, spl]);

  return {
    ...state,
    next: () => { if (!state.busy && state.data?.next) void load(state.page + 1); },
    previous: () => { if (!state.busy && state.data?.previous) void load(Math.max(1, state.page - 1)); },
    retry: () => load(state.requestedPage),
    reload: () => load(state.page),
  };
}

export function useShelfCollection({ spl, ordering }: {
  spl: SecondPassClient | null;
  ordering: "name" | "-item_count";
}) {
  const canLoad = Boolean(spl);
  const personal = useShelfPage("personal", spl, ordering);
  const shared = useShelfPage("shared", spl, ordering);
  const busy = personal.busy || shared.busy;
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<ShelfFormValues>(() => shelfToFormValues());
  const [menuShelfId, setMenuShelfId] = useState<string | null>(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const mutationRequestSeq = useRef(0);

  useEffect(() => {
    setCreateOpen(false);
    setMenuShelfId(null);
    setMutationError(null);
    setMutationBusy(false);
    return () => { mutationRequestSeq.current += 1; };
  }, [spl, ordering, personal.requestedPage, shared.requestedPage]);

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
      await Promise.all([personal.reload(), shared.reload()]);
    } catch (e) {
      debugWarn("reader", "shelf creation did not complete", { error: e });
      if (requestSeq !== mutationRequestSeq.current) return;
      setMutationError("Couldn't create the shelf. Try again.");
    } finally {
      if (requestSeq === mutationRequestSeq.current) setMutationBusy(false);
    }
  }, [createDraft, personal, shared, spl]);

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
      await Promise.all([personal.reload(), shared.reload()]);
    } catch (e) {
      debugWarn("reader", "shelf deletion did not complete", { shelfId: shelf.id, error: e });
      if (requestSeq !== mutationRequestSeq.current) return;
      setMutationError("Couldn't delete the shelf. Try again.");
    } finally {
      if (requestSeq === mutationRequestSeq.current) setMutationBusy(false);
    }
  }, [personal, shared, spl]);

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
    canLoad, busy, personal, shared, createOpen, createDraft, menuShelfId, mutationBusy, mutationError,
    createShelf: handleCreate, deleteShelf: handleDelete,
    beginCreate, cancelCreate, changeCreateDraft: setCreateDraft, toggleMenu, dismissMenu,
  };
}
