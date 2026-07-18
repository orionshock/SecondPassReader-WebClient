import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@secondpass/client";
import type { LibraryAuthor, LibraryBook, LibraryBookListParams, LibraryEntityListParams, LibrarySeries, PaginatedResponse, SecondPassClient } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { getConnectionStatus } from "../connection/connectionStatus";
import type { OrderingOption } from "../../components/OrderingControl";
import { getLibraryBooksView, normalizeLibraryBooksView, saveLibraryBooksView, type LibraryBooksView } from "../../storage/libraryBooksView";
import { CatalogTagRail } from "./catalogTags/CatalogTagRail";
import { LibraryScopeSelect } from "./libraryScope/LibraryScopeSelect";
import { buildLibraryBooksQuery, buildLibraryEntityQuery } from "./data/libraryAxisQueries";
import { deriveLibraryRouteState, type LibraryAxis, type LibraryBookOrdering, type LibraryEntityOrdering } from "./route/libraryRouteState";
import { LibraryAxisTabs } from "./controls/LibraryAxisTabs";
import { LibrarySearchControls } from "./controls/LibrarySearchControls";
import { LibrarySortViewControls } from "./controls/LibrarySortViewControls";
import { LibraryAuthorRows } from "./results/LibraryAuthorRows";
import { LibraryBooksResults } from "./results/LibraryBooksResults";
import { LibrarySelectedAxisHeader } from "./results/LibrarySelectedAxisHeader";
import { LibrarySeriesRows } from "./results/LibrarySeriesRows";

type BrowseMode = LibraryAxis;
type BookOrdering = LibraryBookOrdering;
type EntityOrdering = LibraryEntityOrdering;

const BOOK_ORDERING_OPTIONS: Array<OrderingOption<BookOrdering>> = [
  { value: "title", label: "Title A-Z", icon: "sort_by_alpha" },
  { value: "author", label: "Author A-Z", icon: "person" },
  { value: "series", label: "Series", icon: "auto_stories" },
];

const SERIES_BOOK_ORDERING_OPTIONS: Array<OrderingOption<BookOrdering>> = [
  { value: "series_index", label: "Series order", icon: "format_list_numbered" },
  { value: "title", label: "Title A-Z", icon: "sort_by_alpha" },
  { value: "author", label: "Author A-Z", icon: "person" },
];

const AUTHOR_ORDERING_OPTIONS: Array<OrderingOption<EntityOrdering>> = [
  { value: "name", label: "Author A-Z", icon: "sort_by_alpha" },
  { value: "-book_count", label: "Most books", icon: "format_list_numbered" },
];

const SERIES_ORDERING_OPTIONS: Array<OrderingOption<EntityOrdering>> = [
  { value: "name", label: "Series A-Z", icon: "sort_by_alpha" },
  { value: "-book_count", label: "Most books", icon: "format_list_numbered" },
];

type Props = {
  profile: ConnectionProfile | null;
  spl: SecondPassClient | null;
  route: {
    q?: string;
    browse?: BrowseMode;
    seriesId?: string;
    authorId?: string;
    groupId?: string;
      tag?: string;
      view?: LibraryBooksView;
      ordering?: string;
      page?: number;
      pageSize?: number;
  };
  selectedBookId?: string | null;
  onViewBook?: (bookId: string) => void;
  onCommitSearch?: (q: string) => void;
  onShowBooks?: () => void;
  onShowSeries?: () => void;
  onShowAuthors?: () => void;
  onShowSeriesBooks?: (seriesId: string) => void;
  onShowAuthorBooks?: (authorId: string) => void;
  onUpdateRoute?: (patch: { groupId?: string | null; tag?: string | null; ordering?: string; page?: number; pageSize?: number }) => void;
};

export function LibraryBrowsePage({
  profile,
  spl,
  route,
  selectedBookId,
  onViewBook,
  onCommitSearch,
  onShowBooks,
  onShowSeries,
  onShowAuthors,
  onShowSeriesBooks,
  onShowAuthorBooks,
  onUpdateRoute,
}: Props) {
  const status = useMemo(() => getConnectionStatus(profile), [profile]);
  const apiReady = Boolean(spl);
  const advancedGroupsEnabled = profile?.advancedLibraryGroupsEnabled === true;
  const routeState = useMemo(
    () => deriveLibraryRouteState(route, advancedGroupsEnabled),
    [advancedGroupsEnabled, route],
  );
  const { axis: browseMode, effectiveGroupId, page: routePage, pageSize, q: qFromRoute = "", tag: tagSlug } = routeState;
  const showBookList = routeState.resultKind === "books";
  const bookOrderingOptions = routeState.selectedSeriesId ? SERIES_BOOK_ORDERING_OPTIONS : BOOK_ORDERING_OPTIONS;
  const bookOrdering = routeState.resultKind === "books" ? routeState.ordering as BookOrdering : "title";
  const seriesOrdering = routeState.resultKind === "series" ? routeState.ordering as EntityOrdering : "name";
  const authorsOrdering = routeState.resultKind === "authors" ? routeState.ordering as EntityOrdering : "name";
  const booksQuery = useMemo(() => buildLibraryBooksQuery(routeState), [routeState]);
  const entityQuery = useMemo(() => buildLibraryEntityQuery(routeState), [routeState]);

  const [qDraft, setQDraft] = useState(qFromRoute);
  const [bookViewMode, setBookViewMode] = useState<LibraryBooksView>(() => normalizeLibraryBooksView(route.view) ?? getLibraryBooksView());

  const [booksBusy, setBooksBusy] = useState(false);
  const [booksError, setBooksError] = useState<string | null>(null);
  const [booksPage, setBooksPage] = useState(1);
  const [booksData, setBooksData] = useState<PaginatedResponse<LibraryBook> | null>(null);

  const [seriesBusy, setSeriesBusy] = useState(false);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [seriesPage, setSeriesPage] = useState(1);
  const [seriesData, setSeriesData] = useState<PaginatedResponse<LibrarySeries> | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<LibrarySeries | null>(null);

  const [authorsBusy, setAuthorsBusy] = useState(false);
  const [authorsError, setAuthorsError] = useState<string | null>(null);
  const [authorsPage, setAuthorsPage] = useState(1);
  const [authorsData, setAuthorsData] = useState<PaginatedResponse<LibraryAuthor> | null>(null);
  const [selectedAuthor, setSelectedAuthor] = useState<LibraryAuthor | null>(null);

  const booksRequestSeq = useRef(0);
  const seriesRequestSeq = useRef(0);
  const authorsRequestSeq = useRef(0);

  useEffect(() => {
    setQDraft(qFromRoute);
  }, [qFromRoute]);

  useEffect(() => {
    if (!advancedGroupsEnabled && route.groupId) onUpdateRoute?.({ groupId: null });
  }, [advancedGroupsEnabled, onUpdateRoute, route.groupId]);

  useEffect(() => {
    const viewFromRoute = normalizeLibraryBooksView(route.view);
    if (viewFromRoute) {
      setBookViewMode(viewFromRoute);
      saveLibraryBooksView(viewFromRoute);
    }
  }, [route.view]);

  const handleBookViewChange = useCallback((view: LibraryBooksView) => {
    setBookViewMode(view);
    saveLibraryBooksView(view);
  }, []);

  const handleBookOrderingChange = useCallback(
    (ordering: BookOrdering) => {
      onUpdateRoute?.({ ordering, page: 1, pageSize });
    },
    [onUpdateRoute, pageSize],
  );

  const handleSeriesOrderingChange = useCallback(
    (ordering: EntityOrdering) => onUpdateRoute?.({ ordering, page: 1, pageSize }),
    [onUpdateRoute, pageSize],
  );

  const handleAuthorsOrderingChange = useCallback(
    (ordering: EntityOrdering) => onUpdateRoute?.({ ordering, page: 1, pageSize }),
    [onUpdateRoute, pageSize],
  );

  const handlePageSizeChange = useCallback(
    (nextPageSize: number) => onUpdateRoute?.({ ordering: route.ordering, page: 1, pageSize: nextPageSize }),
    [onUpdateRoute, route.ordering],
  );

  const handlePageChange = useCallback(
    (page: number) => onUpdateRoute?.({ ordering: route.ordering, page, pageSize }),
    [onUpdateRoute, pageSize, route.ordering],
  );

  const loadBooks = useCallback(
    async (params: LibraryBookListParams) => {
      if (!spl) return;

      const requestSeq = ++booksRequestSeq.current;
      setBooksBusy(true);
      setBooksError(null);
      try {
        const result = effectiveGroupId
          ? await spl.library.groups.books(effectiveGroupId, params)
          : await spl.library.books.list(params);
        if (requestSeq !== booksRequestSeq.current) return;
        setBooksData(result);
        setBooksPage(params.page ?? 1);
      } catch (e) {
        if (requestSeq !== booksRequestSeq.current) return;
        setBooksData((current) => {
          if (current) return current;
          return null;
        });
        if (e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")) {
          setBooksError(
            "Your reader client is linked, but this token is not allowed to access the library. It may be revoked, lack permissions, or the server may not support reader-token library access yet.",
          );
        } else {
          setBooksError(e instanceof Error ? e.message : "Failed to load library.");
        }
      } finally {
        if (requestSeq === booksRequestSeq.current) setBooksBusy(false);
      }
    },
    [effectiveGroupId, spl],
  );

  const loadSeries = useCallback(
    async (params: LibraryEntityListParams) => {
      if (!spl) return;
      const requestSeq = ++seriesRequestSeq.current;
      setSeriesBusy(true);
      setSeriesError(null);
      try {
        const r = effectiveGroupId
          ? await spl.library.groups.series(effectiveGroupId, params)
          : await spl.library.series.list({ ...params, includePreviewBooks: true });
        if (requestSeq !== seriesRequestSeq.current) return;
        setSeriesData(r);
        setSeriesPage(params.page ?? 1);
      } catch (e) {
        if (requestSeq !== seriesRequestSeq.current) return;
        setSeriesError(e instanceof Error ? e.message : "Failed to load series.");
      } finally {
        if (requestSeq === seriesRequestSeq.current) setSeriesBusy(false);
      }
    },
    [effectiveGroupId, spl],
  );

  const loadAuthors = useCallback(
    async (params: LibraryEntityListParams) => {
      if (!spl) return;
      const requestSeq = ++authorsRequestSeq.current;
      setAuthorsBusy(true);
      setAuthorsError(null);
      try {
        const r = effectiveGroupId
          ? await spl.library.groups.authors(effectiveGroupId, params)
          : await spl.library.authors.list({ ...params, includePreviewBooks: true });
        if (requestSeq !== authorsRequestSeq.current) return;
        setAuthorsData(r);
        setAuthorsPage(params.page ?? 1);
      } catch (e) {
        if (requestSeq !== authorsRequestSeq.current) return;
        setAuthorsError(e instanceof Error ? e.message : "Failed to load authors.");
      } finally {
        if (requestSeq === authorsRequestSeq.current) setAuthorsBusy(false);
      }
    },
    [effectiveGroupId, spl],
  );

  useEffect(() => {
    setBooksError(null);
    setBooksBusy(false);
  }, [qFromRoute, browseMode, route.seriesId, route.authorId, effectiveGroupId, tagSlug, pageSize, bookOrdering, routePage]);

  useEffect(() => {
    if (status !== "verified") return;
    if (!apiReady || !spl) return;

    // Global search wins over browse.
    if (qFromRoute) {
      void loadBooks(booksQuery);
      return;
    }

    if (browseMode === "series" && route.seriesId) {
      void loadBooks(booksQuery);
      return;
    }

    if (browseMode === "authors" && route.authorId) {
      void loadBooks(booksQuery);
      return;
    }

    if (browseMode === "books") {
      void loadBooks(booksQuery);
      return;
    }

    if (browseMode === "series" && !route.seriesId) {
      void loadSeries(entityQuery);
      return;
    }
    if (browseMode === "authors" && !route.authorId) {
      void loadAuthors(entityQuery);
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, apiReady, qFromRoute, browseMode, route.seriesId, route.authorId, effectiveGroupId, tagSlug, bookOrdering, seriesOrdering, authorsOrdering, routePage, pageSize]);

  useEffect(() => {
    if (status !== "verified") return;
    if (!apiReady || !spl) return;
    if (qFromRoute) {
      setSelectedSeries(null);
      setSelectedAuthor(null);
      return;
    }
    let cancelled = false;

    if (browseMode === "series" && route.seriesId) {
      void (async () => {
        try {
          const s = await spl.library.series.get(route.seriesId!, { includePreviewBooks: true });
          if (!cancelled) setSelectedSeries(s);
        } catch {
          if (!cancelled) setSelectedSeries(null);
        }
      })();
    } else {
      setSelectedSeries(null);
    }

    if (browseMode === "authors" && route.authorId) {
      void (async () => {
        try {
          const a = await spl.library.authors.get(route.authorId!, { includePreviewBooks: true });
          if (!cancelled) setSelectedAuthor(a);
        } catch {
          if (!cancelled) setSelectedAuthor(null);
        }
      })();
    } else {
      setSelectedAuthor(null);
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, apiReady, browseMode, route.seriesId, route.authorId, qFromRoute, spl]);

  const handleCommitSearch = useCallback(() => {
    const next = qDraft.trim();
    onCommitSearch?.(next);
  }, [onCommitSearch, qDraft]);

  return (
    <section className="panel">
      {status === "not_configured" ? <p className="muted">Select a server profile first.</p> : null}
      {status === "configured" ? <p className="muted">Link this profile before loading the library.</p> : null}
      {status === "linked" ? <p className="muted">Verify this profile before loading the library.</p> : null}

      {status === "verified" ? (
        <>
          <LibrarySearchControls
            draft={qDraft}
            pageSize={pageSize}
            onDraftChange={setQDraft}
            onPageSizeChange={handlePageSizeChange}
            onSearch={handleCommitSearch}
          />

          <div className="libraryBrowseTabs" role="tablist" aria-label="Browse by">
            <div className="libraryBrowseTabGroup">
              {spl && advancedGroupsEnabled ? (
                <LibraryScopeSelect
                  spl={spl}
                  groupId={effectiveGroupId}
                  onChange={(groupId) => onUpdateRoute?.({ groupId: groupId ?? null, tag: null, page: 1, pageSize })}
                />
              ) : null}
              <LibraryAxisTabs
                activeAxis={browseMode}
                onShowBooks={() => onShowBooks?.()}
                onShowSeries={() => onShowSeries?.()}
                onShowAuthors={() => onShowAuthors?.()}
              />
            </div>

            <div className="libraryControlsRight">
              {showBookList ? (
                <LibrarySortViewControls kind="books" options={bookOrderingOptions} ordering={bookOrdering} viewMode={bookViewMode} onOrderingChange={handleBookOrderingChange} onViewChange={handleBookViewChange} />
              ) : browseMode === "series" && !route.seriesId ? (
                <LibrarySortViewControls kind="entity" options={SERIES_ORDERING_OPTIONS} ordering={seriesOrdering} onOrderingChange={handleSeriesOrderingChange} ariaLabel="Sort series" />
              ) : browseMode === "authors" && !route.authorId ? (
                <LibrarySortViewControls kind="entity" options={AUTHOR_ORDERING_OPTIONS} ordering={authorsOrdering} onOrderingChange={handleAuthorsOrderingChange} ariaLabel="Sort authors" />
              ) : null}
            </div>
          </div>

          <div className="libraryCatalogLayout">
            {spl ? (
              <CatalogTagRail
                spl={spl}
                groupId={effectiveGroupId}
                selectedSlug={tagSlug}
                onSelect={(slug) => onUpdateRoute?.({ tag: slug ?? null, page: 1, pageSize })}
              />
            ) : null}
            <div className="libraryCatalogResults">
              {booksError ? <p className="errorText">{booksError}</p> : null}
              {showBookList ? (
                <>
                  {browseMode === "series" && selectedSeries ? <LibrarySelectedAxisHeader kind="series" series={selectedSeries} /> : null}
                  {browseMode === "authors" && selectedAuthor ? <LibrarySelectedAxisHeader kind="author" author={selectedAuthor} /> : null}
                  <LibraryBooksResults
                    data={booksData}
                    busy={booksBusy}
                    page={booksPage}
                    pageSize={pageSize}
                    viewMode={bookViewMode}
                    serverBaseUrl={profile?.serverBaseUrl}
                    selectedBookId={selectedBookId ? String(selectedBookId) : null}
                    onViewBook={(book) => onViewBook?.(String(book.id))}
                    onPageChange={handlePageChange}
                  />
                </>
              ) : browseMode === "series" ? (
                <LibrarySeriesRows data={seriesData} busy={seriesBusy} error={seriesError} page={seriesPage} profile={profile} onSelectSeries={(seriesId) => onShowSeriesBooks?.(seriesId)} onViewBook={onViewBook} onPageChange={handlePageChange} />
              ) : (
                <LibraryAuthorRows data={authorsData} busy={authorsBusy} error={authorsError} page={authorsPage} profile={profile} onSelectAuthor={(authorId) => onShowAuthorBooks?.(authorId)} onViewBook={onViewBook} onPageChange={handlePageChange} />
              )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
