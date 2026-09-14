import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@secondpass/client";
import type { SecondPassClient, Shelf, ShelfItem } from "@secondpass/client";
import { debugWarn } from "../../lib/debug/DebugLogger.Diagnostics";

export function useShelfDetail({ spl, shelfId, ordering, page: routePage, pageSize }: {
  spl: SecondPassClient | null;
  shelfId: string;
  ordering: "position" | "title" | "author";
  page: number;
  pageSize: number;
}) {
  const canLoad = Boolean(spl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [loadMoreBusy, setLoadMoreBusy] = useState(false);
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
      debugWarn("reader", "shelf detail could not be loaded", { shelfId, error: e });
      const message =
        e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")
          ? "This account can't access this shelf. Check the connection and try again."
          : e instanceof ApiError && e.status === 404
            ? "Shelf not found or unavailable to this account."
            : "Couldn't load the shelf. Reload the page to try again.";
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
      debugWarn("reader", "more shelf books could not be loaded", { shelfId, error: e });
      setError("Couldn't load more books. Try again.");
    } finally {
      if (requestSeq === loadMoreRequestSeq.current) setLoadMoreBusy(false);
    }
  }, [loadMoreBusy, nextUrl, ordering, pageSize, parseNextPage, shelfId, spl]);

  return { canLoad, busy, error, shelf, items, nextUrl, loadMoreBusy, loadMore };
}
