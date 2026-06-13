import { useEffect, useRef } from "react";

export function useInitialBookSearch({
  initialSearchQuery,
  ready,
  searchReady,
  setQuery,
  runSearch,
}: {
  initialSearchQuery?: string | null;
  ready: boolean;
  searchReady: boolean;
  setQuery: (query: string) => void;
  runSearch: (query: string) => void;
}) {
  const prefilledInitialSearchRef = useRef<string | null>(null);
  const handledInitialSearchRef = useRef<string | null>(null);

  useEffect(() => {
    const initialQuery = initialSearchQuery?.trim() ?? "";
    if (!initialQuery) return;

    if (prefilledInitialSearchRef.current !== initialQuery) {
      prefilledInitialSearchRef.current = initialQuery;
      setQuery(initialQuery);
    }

    if (handledInitialSearchRef.current === initialQuery) return;
    if (initialQuery.length < 2) {
      handledInitialSearchRef.current = initialQuery;
      return;
    }
    if (!ready || !searchReady) return;

    handledInitialSearchRef.current = initialQuery;
    runSearch(initialQuery);
  }, [initialSearchQuery, ready, searchReady, runSearch, setQuery]);
}
