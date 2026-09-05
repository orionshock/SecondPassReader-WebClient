import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Author, CatalogResultPage, CompactBook, LibraryBookListParams, LibraryEntityListParams, Series, SecondPassClient } from "@secondpass/client";
import { buildLibraryBooksQuery, buildLibraryEntityQuery } from "./LibraryAxis.Queries";
import { loadLibraryBooks } from "./LibraryBooks.Queries";
import { loadLibraryAuthors, loadLibrarySeries } from "./LibraryEntities.Queries";
import type { DerivedLibraryRouteState } from "../route/LibraryRoute.State";

type Input = {
  spl: SecondPassClient | null;
  state: DerivedLibraryRouteState;
  canLoad: boolean;
};

export function useLibraryAxisResults({ spl, state, canLoad }: Input) {
  const [booksData, setBooksData] = useState<CatalogResultPage<CompactBook> | null>(null);
  const [booksBusy, setBooksBusy] = useState(false);
  const [booksError, setBooksError] = useState<unknown>(null);
  const [booksPage, setBooksPage] = useState(1);
  const [authorsData, setAuthorsData] = useState<CatalogResultPage<Author> | null>(null);
  const [authorsBusy, setAuthorsBusy] = useState(false);
  const [authorsError, setAuthorsError] = useState<unknown>(null);
  const [authorsPage, setAuthorsPage] = useState(1);
  const [seriesData, setSeriesData] = useState<CatalogResultPage<Series> | null>(null);
  const [seriesBusy, setSeriesBusy] = useState(false);
  const [seriesError, setSeriesError] = useState<unknown>(null);
  const [seriesPage, setSeriesPage] = useState(1);
  const booksRequestSeq = useRef(0);
  const authorsRequestSeq = useRef(0);
  const seriesRequestSeq = useRef(0);

  const booksQuery = useMemo(() => buildLibraryBooksQuery(state), [state]);
  const entityQuery = useMemo(() => buildLibraryEntityQuery(state), [state]);

  const loadBooks = useCallback(async (params: LibraryBookListParams) => {
    if (!spl) return;
    const requestSeq = ++booksRequestSeq.current;
    setBooksBusy(true);
    setBooksError(null);
    try {
      const result = await loadLibraryBooks(spl, state.effectiveGroupId, params, state.searchMode);
      if (requestSeq !== booksRequestSeq.current) return;
      setBooksData(result);
      setBooksPage(params.page ?? 1);
    } catch (error) {
      if (requestSeq !== booksRequestSeq.current) return;
      setBooksData((current) => current ?? null);
      setBooksError(error instanceof Error ? error : new Error("Could not load library results."));
    } finally {
      if (requestSeq === booksRequestSeq.current) setBooksBusy(false);
    }
  }, [spl, state.effectiveGroupId, state.searchMode]);

  const loadAuthors = useCallback(async (params: LibraryEntityListParams) => {
    if (!spl) return;
    const requestSeq = ++authorsRequestSeq.current;
    setAuthorsBusy(true);
    setAuthorsError(null);
    try {
      const result = await loadLibraryAuthors(spl, state.effectiveGroupId, params);
      if (requestSeq !== authorsRequestSeq.current) return;
      setAuthorsData(result);
      setAuthorsPage(params.page ?? 1);
    } catch (error) {
      if (requestSeq !== authorsRequestSeq.current) return;
      setAuthorsError(error instanceof Error ? error : new Error("Could not load library results."));
    } finally {
      if (requestSeq === authorsRequestSeq.current) setAuthorsBusy(false);
    }
  }, [spl, state.effectiveGroupId]);

  const loadSeries = useCallback(async (params: LibraryEntityListParams) => {
    if (!spl) return;
    const requestSeq = ++seriesRequestSeq.current;
    setSeriesBusy(true);
    setSeriesError(null);
    try {
      const result = await loadLibrarySeries(spl, state.effectiveGroupId, params);
      if (requestSeq !== seriesRequestSeq.current) return;
      setSeriesData(result);
      setSeriesPage(params.page ?? 1);
    } catch (error) {
      if (requestSeq !== seriesRequestSeq.current) return;
      setSeriesError(error instanceof Error ? error : new Error("Could not load library results."));
    } finally {
      if (requestSeq === seriesRequestSeq.current) setSeriesBusy(false);
    }
  }, [spl, state.effectiveGroupId]);

  useEffect(() => {
    setBooksError(null);
    setBooksBusy(false);
  }, [state.axis, state.selectedSeriesId, state.selectedAuthorId, state.effectiveGroupId, state.q, state.searchMode, state.tag, state.pageSize, state.ordering, state.page]);

  useEffect(() => {
    if (!canLoad || !spl) return;
    if (state.resultKind === "books") void loadBooks(booksQuery);
    else if (state.resultKind === "series") void loadSeries(entityQuery);
    else void loadAuthors(entityQuery);
  }, [booksQuery, canLoad, entityQuery, loadAuthors, loadBooks, loadSeries, spl, state.resultKind]);

  return {
    books: { data: booksData, busy: booksBusy, error: booksError, page: booksPage },
    authors: { data: authorsData, busy: authorsBusy, error: authorsError, page: authorsPage },
    series: { data: seriesData, busy: seriesBusy, error: seriesError, page: seriesPage },
  };
}
