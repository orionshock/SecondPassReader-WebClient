// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogResultPage, SecondPassClient } from "@secondpass/client";
import { useLibraryAxisResults, type LibraryActiveResult } from "../../features/library/data/LibraryAxisResults.Controller";
import type { DerivedLibraryRouteState } from "../../features/library/route/LibraryRoute.State";

const loaders = vi.hoisted(() => ({
  books: vi.fn(),
  authors: vi.fn(),
  series: vi.fn(),
}));

vi.mock("../../features/library/data/LibraryBooks.Queries", () => ({ loadLibraryBooks: loaders.books }));
vi.mock("../../features/library/data/LibraryEntities.Queries", () => ({
  loadLibraryAuthors: loaders.authors,
  loadLibrarySeries: loaders.series,
}));

describe("Library active-result ownership", () => {
  let root: Root;
  let result: LibraryActiveResult;
  let client: SecondPassClient;

  function Harness({ state, canLoad = true }: { state: DerivedLibraryRouteState; canLoad?: boolean }) {
    result = useLibraryAxisResults({ spl: client, state, canLoad });
    return null;
  }

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    root = createRoot(document.createElement("div"));
    client = {} as SecondPassClient;
    loaders.books.mockReset().mockReturnValue(new Promise(() => {}));
    loaders.authors.mockReset().mockReturnValue(new Promise(() => {}));
    loaders.series.mockReset().mockReturnValue(new Promise(() => {}));
  });

  afterEach(() => act(() => root.unmount()));

  it.each(["success", "failure"])("keeps Authors authoritative after stale Books %s", async (outcome) => {
    const oldBooks = deferred<CatalogResultPage<never>>();
    const currentAuthors = deferred<CatalogResultPage<never>>();
    loaders.books.mockReturnValueOnce(oldBooks.promise);
    loaders.authors.mockReturnValueOnce(currentAuthors.promise);
    await render(<Harness state={routeState({ axis: "books", resultKind: "books" })} />);

    await render(<Harness state={routeState({ axis: "authors", resultKind: "authors", ordering: "name" })} />);
    expect(result).toMatchObject({ kind: "authors", busy: true, error: null });
    await act(async () => {
      if (outcome === "success") oldBooks.resolve(page("old-book"));
      else oldBooks.reject(new Error("obsolete books failure"));
    });

    expect(result).toMatchObject({ kind: "authors", data: null, busy: true, error: null, page: 1 });
    await act(async () => currentAuthors.resolve(page("current-author")));
    expect(result).toMatchObject({ kind: "authors", data: page("current-author"), busy: false, error: null });
  });

  it("keeps Series authoritative after a stale Authors completion", async () => {
    const oldAuthors = deferred<CatalogResultPage<never>>();
    const currentSeries = deferred<CatalogResultPage<never>>();
    loaders.authors.mockReturnValueOnce(oldAuthors.promise);
    loaders.series.mockReturnValueOnce(currentSeries.promise);
    await render(<Harness state={routeState({ axis: "authors", resultKind: "authors", ordering: "name" })} />);

    await render(<Harness state={routeState({ axis: "series", resultKind: "series", ordering: "name" })} />);
    await act(async () => oldAuthors.resolve(page("old-author")));

    expect(result).toMatchObject({ kind: "series", data: null, busy: true, error: null });
    await act(async () => currentSeries.resolve(page("current-series")));
    expect(result).toMatchObject({ kind: "series", data: page("current-series"), busy: false });
  });

  it.each(["success", "failure"])("does not let an old query %s clear the newer query's busy state", async (outcome) => {
    const oldQuery = deferred<CatalogResultPage<never>>();
    const currentQuery = deferred<CatalogResultPage<never>>();
    loaders.books.mockReturnValueOnce(oldQuery.promise).mockReturnValueOnce(currentQuery.promise);
    await render(<Harness state={routeState({ q: "old" })} />);

    await render(<Harness state={routeState({ q: "current", tag: "fiction", effectiveGroupId: "group-1" })} />);
    await act(async () => {
      if (outcome === "success") oldQuery.resolve(page("old-query"));
      else oldQuery.reject(new Error("obsolete query failure"));
    });

    expect(result).toMatchObject({ kind: "books", data: null, busy: true, error: null });
    await act(async () => currentQuery.resolve(page("current-query")));
    expect(result).toMatchObject({ data: page("current-query"), busy: false, error: null });
  });

  it("retains current data during pagination but rejects that page after identity changes", async () => {
    loaders.books.mockResolvedValueOnce(page("page-1"));
    await render(<Harness state={routeState({ page: 1 })} />);
    expect(result).toMatchObject({ data: page("page-1"), page: 1, busy: false });
    const oldPage = deferred<CatalogResultPage<never>>();
    const currentFilter = deferred<CatalogResultPage<never>>();
    loaders.books.mockReturnValueOnce(oldPage.promise).mockReturnValueOnce(currentFilter.promise);

    await render(<Harness state={routeState({ page: 2 })} />);
    expect(result).toMatchObject({ data: page("page-1"), page: 1, busy: true });
    await render(<Harness state={routeState({ page: 1, tag: "current" })} />);
    await act(async () => oldPage.resolve(page("stale-page-2")));

    expect(result).toMatchObject({ data: page("page-1"), page: 1, busy: true, error: null });
    await act(async () => currentFilter.resolve(page("current-filter")));
    expect(result).toMatchObject({ data: page("current-filter"), page: 1, busy: false });
  });

  it("rejects the old client's result after client replacement", async () => {
    const oldClientResult = deferred<CatalogResultPage<never>>();
    const currentClientResult = deferred<CatalogResultPage<never>>();
    loaders.books.mockReturnValueOnce(oldClientResult.promise).mockReturnValueOnce(currentClientResult.promise);
    await render(<Harness state={routeState()} />);

    client = {} as SecondPassClient;
    await render(<Harness state={routeState()} />);
    await act(async () => oldClientResult.resolve(page("old-client")));

    expect(result).toMatchObject({ data: null, busy: true, error: null });
    await act(async () => currentClientResult.resolve(page("current-client")));
    expect(result).toMatchObject({ data: page("current-client"), busy: false });
  });

  it("does not present cached data from a replaced client", async () => {
    loaders.books.mockResolvedValueOnce(page("old-client-cache"));
    await render(<Harness state={routeState()} />);
    expect(result).toMatchObject({ data: page("old-client-cache"), busy: false });
    const currentClientResult = deferred<CatalogResultPage<never>>();
    loaders.books.mockReturnValueOnce(currentClientResult.promise);

    client = {} as SecondPassClient;
    await render(<Harness state={routeState()} />);

    expect(result).toMatchObject({ data: null, busy: true, error: null });
    await act(async () => currentClientResult.resolve(page("current-client")));
    expect(result).toMatchObject({ data: page("current-client"), busy: false });
  });

  it("invalidates pending work when the result becomes ineligible", async () => {
    const pending = deferred<CatalogResultPage<never>>();
    loaders.books.mockReturnValueOnce(pending.promise);
    const state = routeState();
    await render(<Harness state={state} />);

    await render(<Harness state={state} canLoad={false} />);
    await act(async () => pending.resolve(page("stale")));

    expect(result).toMatchObject({ kind: "books", data: null, busy: false, error: null });
  });

  it.each([
    ["books", "title", loaders.books],
    ["authors", "name", loaders.authors],
    ["series", "name", loaders.series],
  ] as const)("publishes the current %s result normally", async (kind, ordering, loader) => {
    loader.mockResolvedValueOnce(page(`current-${kind}`));

    await render(<Harness state={routeState({ axis: kind, resultKind: kind, ordering })} />);

    expect(result).toMatchObject({ kind, data: page(`current-${kind}`), busy: false, error: null, page: 1 });
  });

  it("publishes an error only for the current result identity", async () => {
    const failure = new Error("current failure");
    loaders.series.mockRejectedValueOnce(failure);

    await render(<Harness state={routeState({ axis: "series", resultKind: "series", ordering: "name" })} />);

    expect(result).toMatchObject({ kind: "series", data: null, busy: false, error: failure, page: 1 });
  });

  async function render(element: React.ReactNode) {
    await act(async () => root.render(element));
  }
});

function routeState(overrides: Partial<DerivedLibraryRouteState> = {}): DerivedLibraryRouteState {
  return {
    axis: "books",
    resultKind: "books",
    searchMode: "axis",
    page: 1,
    pageSize: 24,
    ordering: "title",
    ...overrides,
  };
}

function page(id: string): CatalogResultPage<never> {
  return { count: 1, next: null, previous: null, results: [{ id }] as never[] };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
