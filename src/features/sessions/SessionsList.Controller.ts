import { useCallback, useEffect, useState } from "react";
import type { BoundedSessionBook, MarginaliaSessionListItem, MarginaliaSessionSummary, PaginatedResponse, SecondPassClient } from "@secondpass/client";
import { loadSessionsPage } from "../reader/ReaderMarginalia.Queries";
import { debugWarn } from "../../lib/debug/DebugLogger.Diagnostics";

type Filter = "all" | "active" | "closed";

export function useSessionsList({ spl, bookId, searchQuery }: {
  spl: SecondPassClient | null;
  bookId?: string | null;
  searchQuery?: string | null;
}) {
  const canLoad = Boolean(spl);
  const bookFilter = typeof bookId === "string" && bookId.trim() ? bookId.trim() : null;
  const effectiveSearchQuery = typeof searchQuery === "string" ? searchQuery.trim() : "";
  const [filter, setFilter] = useState<Filter>("all");
  const [pageSize, setPageSize] = useState(20);
  const [searchDraft, setSearchDraft] = useState(effectiveSearchQuery);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<(PaginatedResponse<MarginaliaSessionSummary | MarginaliaSessionListItem> & { context?: { book: BoundedSessionBook } }) | null>(null);

  const load = useCallback(
    async (targetPage: number) => {
      if (!spl) return;
      setBusy(true);
      setError(null);
      try {
        const r = await loadSessionsPage({
          spl,
          bookId: bookFilter ?? undefined,
          status: filter === "all" ? undefined : filter,
          q: effectiveSearchQuery || undefined,
          page: targetPage,
          pageSize,
        });
        setData(r);
        setPage(targetPage);
      } catch (e) {
        debugWarn("reader", "Reading Sessions could not be loaded", {
          bookId: bookFilter,
          page: targetPage,
          error: e,
        });
        setError(e instanceof Error ? e : new Error("Could not load Reading Sessions."));
        setData(null);
      } finally {
        setBusy(false);
      }
    },
    [bookFilter, effectiveSearchQuery, filter, pageSize, spl],
  );

  useEffect(() => {
    setSearchDraft(effectiveSearchQuery);
  }, [effectiveSearchQuery]);

  useEffect(() => {
    setData(null);
    setError(null);
    setBusy(false);
    setPage(1);
    if (!canLoad) return;
    void load(1);
  }, [bookFilter, canLoad, effectiveSearchQuery, filter, load, pageSize]);

  const contextBook = data?.context?.book ?? null;
  const sessions = data?.results ?? [];

  const previousPage = useCallback(() => load(Math.max(1, page - 1)), [load, page]);
  const nextPage = useCallback(() => load(page + 1), [load, page]);

  return {
    canLoad, bookFilter, effectiveSearchQuery, filter, pageSize, searchDraft,
    busy, error, page, data, contextBook, sessions,
    changeFilter: setFilter, changePageSize: setPageSize, changeSearchDraft: setSearchDraft,
    previousPage, nextPage,
  };
}
