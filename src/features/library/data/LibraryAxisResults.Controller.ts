import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Author,
  CatalogResultPage,
  CompactBook,
  LibraryBookListParams,
  LibraryEntityListParams,
  Series,
  SecondPassClient,
} from "@secondpass/client";
import { buildLibraryBooksQuery, buildLibraryEntityQuery } from "./LibraryAxis.Queries";
import { loadLibraryBooks } from "./LibraryBooks.Queries";
import { loadLibraryAuthors, loadLibrarySeries } from "./LibraryEntities.Queries";
import type { DerivedLibraryRouteState, LibraryAxis } from "../route/LibraryRoute.State";
import { debugWarn } from "../../../lib/debug/DebugLogger.Diagnostics";

type Input = {
  spl: SecondPassClient | null;
  state: DerivedLibraryRouteState;
  canLoad: boolean;
};

type ResultState<T> = {
  data: CatalogResultPage<T> | null;
  busy: boolean;
  error: unknown;
  page: number;
};

export type LibraryActiveResult =
  | ({ kind: "books" } & ResultState<CompactBook>)
  | ({ kind: "authors" } & ResultState<Author>)
  | ({ kind: "series" } & ResultState<Series>);

type ResultCache = {
  books: Pick<ResultState<CompactBook>, "data" | "page">;
  authors: Pick<ResultState<Author>, "data" | "page">;
  series: Pick<ResultState<Series>, "data" | "page">;
};

type ResultIdentity = {
  client: SecondPassClient | null;
  canLoad: boolean;
  axis: LibraryAxis;
  effectiveGroupId?: string;
} & (
  | { kind: "books"; query: LibraryBookListParams; searchMode: DerivedLibraryRouteState["searchMode"] }
  | { kind: "authors" | "series"; query: LibraryEntityListParams }
);

type PublishedResult = {
  identity: ResultIdentity;
  result: LibraryActiveResult;
};

type LoadedResult =
  | { kind: "books"; data: CatalogResultPage<CompactBook> }
  | { kind: "authors"; data: CatalogResultPage<Author> }
  | { kind: "series"; data: CatalogResultPage<Series> };

export function useLibraryAxisResults({ spl, state, canLoad }: Input): LibraryActiveResult {
  const requestSeq = useRef(0);
  const cacheRef = useRef<ResultCache>(createEmptyCache());
  const cacheClientRef = useRef(spl);
  if (cacheClientRef.current !== spl) {
    cacheClientRef.current = spl;
    cacheRef.current = createEmptyCache();
  }
  const booksQuery = useMemo(() => buildLibraryBooksQuery(state), [state]);
  const entityQuery = useMemo(() => buildLibraryEntityQuery(state), [state]);
  const identity = useMemo<ResultIdentity>(() => {
    const base = { client: spl, canLoad, axis: state.axis, effectiveGroupId: state.effectiveGroupId };
    if (state.resultKind === "books") {
      return { ...base, kind: "books", query: booksQuery, searchMode: state.searchMode };
    }
    return { ...base, kind: state.resultKind, query: entityQuery };
  }, [booksQuery, canLoad, entityQuery, spl, state.axis, state.effectiveGroupId, state.resultKind, state.searchMode]);
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const [published, setPublished] = useState<PublishedResult>(() => ({
    identity,
    result: createResult(identity.kind, cacheRef.current, false, null),
  }));

  useEffect(() => {
    const request = ++requestSeq.current;
    const isCurrent = () => request === requestSeq.current && identityRef.current === identity;
    const publish = (result: LibraryActiveResult) => {
      if (isCurrent()) setPublished({ identity, result });
    };

    // Only the request matching the current Library query identity may publish;
    // axis, filter, eligibility, or client changes invalidate older work.
    if (!identity.canLoad || !identity.client) {
      publish(createResult(identity.kind, cacheRef.current, false, null));
      return () => {
        if (request === requestSeq.current) requestSeq.current += 1;
      };
    }

    publish(createResult(identity.kind, cacheRef.current, true, null));
    void loadResult(identity).then((loaded) => {
      if (!isCurrent()) return;
      const page = identity.query.page ?? 1;
      if (loaded.kind === "books") cacheRef.current.books = { data: loaded.data, page };
      else if (loaded.kind === "authors") cacheRef.current.authors = { data: loaded.data, page };
      else cacheRef.current.series = { data: loaded.data, page };
      publish({ ...loaded, busy: false, error: null, page });
    }).catch((reason: unknown) => {
      if (!isCurrent()) return;
      debugWarn("reader", `Library ${getResultLabel(identity.kind)} results could not be loaded`, { error: reason });
      publish(createResult(
        identity.kind,
        cacheRef.current,
        false,
        reason instanceof Error ? reason : new Error("Could not load library results."),
      ));
    });

    return () => {
      if (request === requestSeq.current) requestSeq.current += 1;
    };
  }, [identity]);

  return published.identity === identity
    ? published.result
    : createResult(identity.kind, cacheRef.current, false, null);
}

async function loadResult(identity: ResultIdentity): Promise<LoadedResult> {
  const client = identity.client!;
  if (identity.kind === "books") {
    return { kind: "books", data: await loadLibraryBooks(client, identity.effectiveGroupId, identity.query, identity.searchMode) };
  }
  if (identity.kind === "authors") {
    return { kind: "authors", data: await loadLibraryAuthors(client, identity.effectiveGroupId, identity.query) };
  }
  return { kind: "series", data: await loadLibrarySeries(client, identity.effectiveGroupId, identity.query) };
}

function createResult(
  kind: LibraryActiveResult["kind"],
  cache: ResultCache,
  busy: boolean,
  error: unknown,
): LibraryActiveResult {
  if (kind === "books") return { kind, ...cache.books, busy, error };
  if (kind === "authors") return { kind, ...cache.authors, busy, error };
  return { kind, ...cache.series, busy, error };
}

function getResultLabel(kind: LibraryActiveResult["kind"]): string {
  if (kind === "books") return "Book";
  if (kind === "authors") return "Author";
  return "Series";
}

function createEmptyCache(): ResultCache {
  return {
    books: { data: null, page: 1 },
    authors: { data: null, page: 1 },
    series: { data: null, page: 1 },
  };
}
