import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReaderSearchResult } from "../../domain/types";
import type { ReaderSearchBookHandle } from "../../domain/ReaderBridge.Types";
import { SEARCH_RESULT_BATCH_SIZE, SEARCH_RESULT_SAFETY_LIMIT, type BookSearchStatus } from "./ReaderBookSearch.Constants";
import { useInitialBookSearch } from "./ReaderBookSearchInitial.Lifecycle";

export function useBookSearchController({
  open,
  ready,
  searchBook,
  initialSearchQuery,
}: {
  open: boolean;
  ready: boolean;
  searchBook: ReaderSearchBookHandle | null;
  initialSearchQuery?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [status, setStatus] = useState<BookSearchStatus>("idle");
  const [results, setResults] = useState<ReaderSearchResult[]>([]);
  const [visibleCount, setVisibleCount] = useState(SEARCH_RESULT_BATCH_SIZE);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const clearSearchResults = useCallback(() => {
    abortRef.current?.abort();
    requestIdRef.current += 1;
    setSearchedQuery("");
    setStatus("idle");
    setResults([]);
    setVisibleCount(SEARCH_RESULT_BATCH_SIZE);
    setSelectedResultId(null);
    setError(null);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const runSearch = useCallback((rawQuery = query) => {
    const submittedQuery = rawQuery.trim();
    if (!submittedQuery) {
      clearSearchResults();
      return;
    }
    if (!searchBook || submittedQuery.length < 2) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus("searching");
    setError(null);
    setSearchedQuery(submittedQuery);
    setResults([]);
    setVisibleCount(SEARCH_RESULT_BATCH_SIZE);
    setSelectedResultId(null);

    void (async () => {
      try {
        const next = await searchBook(submittedQuery, {
          maxResults: SEARCH_RESULT_SAFETY_LIMIT,
          maxSeqEle: 6,
          signal: controller.signal,
          onProgress: (partial) => {
            if (requestIdRef.current !== requestId || controller.signal.aborted) return;
            setResults(partial);
          },
        });
        if (requestIdRef.current !== requestId || controller.signal.aborted) return;
        setResults(next);
        setStatus("ready");
      } catch (err) {
        if (requestIdRef.current !== requestId || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Search failed.");
        setStatus("error");
      }
    })();
  }, [clearSearchResults, query, searchBook]);

  useInitialBookSearch({
    initialSearchQuery,
    ready,
    searchReady: Boolean(searchBook),
    setQuery,
    runSearch,
  });

  const trimmedQuery = query.trim();
  const visibleResults = results.slice(0, visibleCount);
  const canSubmitSearch = ready && Boolean(searchBook) && status !== "searching" && (trimmedQuery.length === 0 || trimmedQuery.length >= 2);
  const showMore = useCallback(() => setVisibleCount((count) => count + SEARCH_RESULT_BATCH_SIZE), []);

  return useMemo(() => ({
    query,
    setQuery,
    searchedQuery,
    status,
    results,
    visibleResults,
    visibleCount,
    selectedResultId,
    setSelectedResultId,
    error,
    inputRef,
    trimmedQuery,
    canSubmitSearch,
    canShowMore: visibleCount < results.length,
    showMore,
    runSearch,
  }), [canSubmitSearch, error, query, results, runSearch, searchedQuery, selectedResultId, showMore, status, trimmedQuery, visibleCount, visibleResults]);
}
