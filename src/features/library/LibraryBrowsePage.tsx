import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ApiError } from "@secondpass/client";
import type { LibraryAuthor, LibraryBook, LibrarySeries, PaginatedResponse, SecondPassClient } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { getConnectionStatus } from "../connection/connectionStatus";
import { BookResultsView } from "./display/BookResultsView";
import { BookViewModeToggle } from "./display/BookViewModeToggle";
import { CoverPreviewStrip } from "./display/CoverPreviewStrip";
import { ExpandableText } from "./display/ExpandableText";
import { InlineMeta } from "../../components/MetaSeparator";
import { MaterialIcon } from "../../components/MaterialIcon";
import { OrderingControl, type OrderingOption } from "../../components/OrderingControl";
import { getLibraryBooksView, normalizeLibraryBooksView, saveLibraryBooksView, type LibraryBooksView } from "../../storage/libraryBooksView";
import { CatalogTagRail } from "./catalogTags/CatalogTagRail";
import { LibraryScopeSelect } from "./libraryScope/LibraryScopeSelect";

type BrowseMode = "books" | "series" | "authors";
type BookOrdering = "title" | "author" | "series" | "series_index";
type EntityOrdering = "name" | "-book_count";

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

function getDefaultBookOrdering(browseMode: BrowseMode, seriesId?: string): BookOrdering {
  return browseMode === "series" && seriesId ? "series_index" : "title";
}

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
  const qFromRoute = (route.q ?? "").trim();
  const browseFromRoute = route.browse ?? "books";
  const browseMode: BrowseMode = qFromRoute
    ? "books"
    : browseFromRoute === "series" || browseFromRoute === "authors" || browseFromRoute === "books"
      ? browseFromRoute
      : "books";
  const defaultBookOrdering = getDefaultBookOrdering(browseMode, route.seriesId);
  const routePage = route.page ?? 1;
  const pageSize = route.pageSize ?? 20;
  const tagSlug = route.tag?.trim() || undefined;
  const showBookList = Boolean(
    qFromRoute ||
      browseMode === "books" ||
      (browseMode === "series" && route.seriesId) ||
      (browseMode === "authors" && route.authorId),
  );
  const bookOrderingOptions = browseMode === "series" && route.seriesId ? SERIES_BOOK_ORDERING_OPTIONS : BOOK_ORDERING_OPTIONS;
  const validBookOrderings = new Set(bookOrderingOptions.map((option) => option.value));
  const bookOrdering = validBookOrderings.has(route.ordering as BookOrdering) ? (route.ordering as BookOrdering) : defaultBookOrdering;
  const seriesOrdering = SERIES_ORDERING_OPTIONS.some((option) => option.value === route.ordering) ? (route.ordering as EntityOrdering) : "name";
  const authorsOrdering = AUTHOR_ORDERING_OPTIONS.some((option) => option.value === route.ordering) ? (route.ordering as EntityOrdering) : "name";

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
    async (input: {
      page: number;
      q?: string;
      seriesId?: string;
      authorId?: string;
      groupId?: string;
      tag?: string;
      ordering: BookOrdering;
    }) => {
      if (!spl) return;

      const requestSeq = ++booksRequestSeq.current;
      setBooksBusy(true);
      setBooksError(null);
      try {
        const result = input.groupId
          ? await spl.library.groups.books(input.groupId, {
              ordering: input.ordering,
              tag: input.tag,
              page: input.page,
              pageSize,
            })
          : await spl.library.books.list({
              q: input.q?.trim() ? input.q.trim() : undefined,
              series: input.seriesId,
              author: input.authorId,
              tag: input.tag,
              ordering: input.ordering,
              page: input.page,
              pageSize,
            });
        if (requestSeq !== booksRequestSeq.current) return;
        setBooksData(result);
        setBooksPage(input.page);
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
    [pageSize, spl],
  );

  const loadSeries = useCallback(
    async (page: number) => {
      if (!spl) return;
      const requestSeq = ++seriesRequestSeq.current;
      setSeriesBusy(true);
      setSeriesError(null);
      try {
        const params = { tag: tagSlug, page, pageSize, ordering: seriesOrdering } as const;
        const r = route.groupId
          ? await spl.library.groups.series(route.groupId, params)
          : await spl.library.series.list({ ...params, includePreviewBooks: true });
        if (requestSeq !== seriesRequestSeq.current) return;
        setSeriesData(r);
        setSeriesPage(page);
      } catch (e) {
        if (requestSeq !== seriesRequestSeq.current) return;
        setSeriesError(e instanceof Error ? e.message : "Failed to load series.");
      } finally {
        if (requestSeq === seriesRequestSeq.current) setSeriesBusy(false);
      }
    },
    [pageSize, route.groupId, seriesOrdering, spl, tagSlug],
  );

  const loadAuthors = useCallback(
    async (page: number) => {
      if (!spl) return;
      const requestSeq = ++authorsRequestSeq.current;
      setAuthorsBusy(true);
      setAuthorsError(null);
      try {
        const params = { tag: tagSlug, page, pageSize, ordering: authorsOrdering } as const;
        const r = route.groupId
          ? await spl.library.groups.authors(route.groupId, params)
          : await spl.library.authors.list({ ...params, includePreviewBooks: true });
        if (requestSeq !== authorsRequestSeq.current) return;
        setAuthorsData(r);
        setAuthorsPage(page);
      } catch (e) {
        if (requestSeq !== authorsRequestSeq.current) return;
        setAuthorsError(e instanceof Error ? e.message : "Failed to load authors.");
      } finally {
        if (requestSeq === authorsRequestSeq.current) setAuthorsBusy(false);
      }
    },
    [authorsOrdering, pageSize, route.groupId, spl, tagSlug],
  );

  useEffect(() => {
    setBooksError(null);
    setBooksBusy(false);
  }, [qFromRoute, browseMode, route.seriesId, route.authorId, route.groupId, tagSlug, pageSize, bookOrdering, routePage]);

  useEffect(() => {
    if (status !== "verified") return;
    if (!apiReady || !spl) return;

    // Global search wins over browse.
    if (qFromRoute) {
      void loadBooks({ page: routePage, q: qFromRoute, groupId: route.groupId, tag: tagSlug, ordering: bookOrdering });
      return;
    }

    if (browseMode === "series" && route.seriesId) {
      void loadBooks({ page: routePage, seriesId: route.seriesId, groupId: route.groupId, tag: tagSlug, ordering: bookOrdering });
      return;
    }

    if (browseMode === "authors" && route.authorId) {
      void loadBooks({ page: routePage, authorId: route.authorId, groupId: route.groupId, tag: tagSlug, ordering: bookOrdering });
      return;
    }

    if (browseMode === "books") {
      void loadBooks({ page: routePage, groupId: route.groupId, tag: tagSlug, ordering: bookOrdering });
      return;
    }

    if (browseMode === "series" && !route.seriesId) {
      void loadSeries(routePage);
      return;
    }
    if (browseMode === "authors" && !route.authorId) {
      void loadAuthors(routePage);
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, apiReady, qFromRoute, browseMode, route.seriesId, route.authorId, route.groupId, tagSlug, bookOrdering, seriesOrdering, authorsOrdering, routePage, pageSize]);

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

  const handleCardKeyDown = useCallback((event: KeyboardEvent<HTMLElement>, action: () => void) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    action();
  }, []);

  const booksPager = useMemo(() => {
    if (!booksData) return null;
    const totalPages = Math.max(1, Math.ceil((booksData.count ?? 0) / pageSize));
    return { totalPages };
  }, [booksData, pageSize]);

  const selectedSeriesSummary = typeof selectedSeries?.summary === "string" ? selectedSeries.summary.trim() : "";
  const selectedAuthorBiography = typeof selectedAuthor?.biography === "string" ? selectedAuthor.biography.trim() : "";
  const bookListMetaItems = booksData
    ? [
        `Page ${booksPage} of ${booksPager?.totalPages ?? 1}`,
        `${booksData.count} books`,
      ]
    : [];

  return (
    <section className="panel">
      {status === "not_configured" ? <p className="muted">Select a server profile first.</p> : null}
      {status === "configured" ? <p className="muted">Link this profile before loading the library.</p> : null}
      {status === "linked" ? <p className="muted">Verify this profile before loading the library.</p> : null}

      {status === "verified" ? (
        <>
          <div className="librarySearchSection">
            <div className="libraryToolbar">
              <label className="toolbarField toolbarSearch">
                <span className="srOnly">Search</span>
                <input
                  className="input inputCompact"
                  value={qDraft}
                  onChange={(e) => setQDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    handleCommitSearch();
                  }}
                  placeholder="Search the library..."
                />
              </label>

              <label className="toolbarField">
                <span className="srOnly">Page size</span>
                <select
                  className="input inputCompact"
                  value={pageSize}
                  onChange={(e) => {
                    handlePageSizeChange(Number(e.target.value));
                  }}
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>

              <button className="button buttonPrimary librarySearchButton" type="button" onClick={handleCommitSearch}>
                Search
              </button>
            </div>
          </div>

          <div className="libraryBrowseTabs" role="tablist" aria-label="Browse by">
            <div className="libraryBrowseTabGroup">
              {spl ? (
                <LibraryScopeSelect
                  spl={spl}
                  groupId={route.groupId}
                  onChange={(groupId) => onUpdateRoute?.({ groupId: groupId ?? null, tag: null, page: 1, pageSize })}
                />
              ) : null}
              <button
                type="button"
                className={`libraryBrowseTab ${browseMode === "books" ? "libraryBrowseTabActive" : ""}`}
                onClick={() => onShowBooks?.()}
              >
                <MaterialIcon name="menu_book" />
                Books
              </button>
              <button
                type="button"
                className={`libraryBrowseTab ${browseMode === "series" ? "libraryBrowseTabActive" : ""}`}
                onClick={() => onShowSeries?.()}
              >
                <MaterialIcon name="auto_stories" />
                Series
              </button>
              <button
                type="button"
                className={`libraryBrowseTab ${browseMode === "authors" ? "libraryBrowseTabActive" : ""}`}
                onClick={() => onShowAuthors?.()}
              >
                <MaterialIcon name="person" />
                Authors
              </button>
            </div>

            <div className="libraryControlsRight">
              {showBookList ? (
                <>
                  <OrderingControl
                    options={bookOrderingOptions}
                    value={bookOrdering}
                    onChange={handleBookOrderingChange}
                    ariaLabel="Sort books"
                  />
                  <BookViewModeToggle viewMode={bookViewMode} onChange={handleBookViewChange} />
                </>
              ) : browseMode === "series" && !route.seriesId ? (
                <OrderingControl
                  options={SERIES_ORDERING_OPTIONS}
                  value={seriesOrdering}
                  onChange={handleSeriesOrderingChange}
                  ariaLabel="Sort series"
                />
              ) : browseMode === "authors" && !route.authorId ? (
                <OrderingControl
                  options={AUTHOR_ORDERING_OPTIONS}
                  value={authorsOrdering}
                  onChange={handleAuthorsOrderingChange}
                  ariaLabel="Sort authors"
                />
              ) : null}
            </div>
          </div>

          <div className="libraryCatalogLayout">
            {spl ? (
              <CatalogTagRail
                spl={spl}
                groupId={route.groupId}
                selectedSlug={tagSlug}
                onSelect={(slug) => onUpdateRoute?.({ tag: slug ?? null, page: 1, pageSize })}
              />
            ) : null}
            <div className="libraryCatalogResults">
          {booksError ? <p className="errorText">{booksError}</p> : null}

          {showBookList ? (
            <>
              {browseMode === "series" && selectedSeries ? (
                <div className="libraryBrowseHeader">
                  <div>
                    <div className="panelTitle" style={{ margin: 0 }}>
                      {selectedSeries.name}
                    </div>
                    <ExpandableText
                      key={`series-${String(selectedSeries.id)}`}
                      text={selectedSeriesSummary}
                      collapsedLines={1}
                      className="libraryBrowseHeaderText"
                      label="series summary"
                    />
                  </div>
                </div>
              ) : null}

              {browseMode === "authors" && selectedAuthor ? (
                <div className="libraryBrowseHeader">
                  <div>
                    <div className="panelTitle" style={{ margin: 0 }}>
                      {selectedAuthor.name}
                    </div>
                    <ExpandableText
                      key={`author-${String(selectedAuthor.id)}`}
                      text={selectedAuthorBiography}
                      collapsedLines={1}
                      className="libraryBrowseHeaderText"
                      label="author biography"
                    />
                  </div>
                </div>
              ) : null}

              {booksData ? (
                <>
                  <div className="libraryMetaRow">
                    <div className="muted">
                      <InlineMeta items={bookListMetaItems} />
                    </div>
                    <div className="pagerButtons">
                      <button
                        className="button buttonCompact"
                        type="button"
                        onClick={() => handlePageChange(Math.max(1, booksPage - 1))}
                        disabled={booksBusy || !booksData.previous}
                      >
                        Previous
                      </button>
                      <button
                        className="button buttonCompact"
                        type="button"
                        onClick={() => handlePageChange(booksPage + 1)}
                        disabled={booksBusy || !booksData.next}
                      >
                        Next
                      </button>
                    </div>
                  </div>

                  <BookResultsView
                    books={booksData.results}
                    viewMode={bookViewMode}
                    serverBaseUrl={profile?.serverBaseUrl}
                    selectedBookId={selectedBookId ? String(selectedBookId) : null}
                    onViewBook={(b) => onViewBook?.(String(b.id))}
                  />

                  <div className="libraryMetaRow libraryMetaRowBottom">
                    <div className="muted">
                      <InlineMeta items={bookListMetaItems} />
                    </div>
                    <div className="pagerButtons">
                      <button
                        className="button buttonCompact"
                        type="button"
                        onClick={() => handlePageChange(Math.max(1, booksPage - 1))}
                        disabled={booksBusy || !booksData.previous}
                      >
                        Previous
                      </button>
                      <button
                        className="button buttonCompact"
                        type="button"
                        onClick={() => handlePageChange(booksPage + 1)}
                        disabled={booksBusy || !booksData.next}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="muted" style={{ marginTop: 10 }}>
                  {booksBusy ? `Loading${"\u2026"}` : "No results yet."}
                </div>
              )}
            </>
          ) : browseMode === "series" ? (
            <>
              {seriesError ? <p className="errorText">{seriesError}</p> : null}
              {seriesBusy && !seriesData ? <div className="muted" style={{ marginTop: 10 }}>{`Loading${"\u2026"}`}</div> : null}

              {seriesData?.results?.length ? (
                <div className="libraryEntityList">
                  {seriesData.results.map((s) => {
                    const openSeries = () => onShowSeriesBooks?.(String(s.id));
                    return (
                    <div
                      key={String(s.id)}
                      className="libraryEntityCard libraryEntityCardButton"
                      role="button"
                      tabIndex={0}
                      onClick={openSeries}
                      onKeyDown={(event) => handleCardKeyDown(event, openSeries)}
                      aria-label={`View books in ${s.name}`}
                      title={`View books in ${s.name}`}
                    >
                      <div className="libraryEntityMain">
                        <div className="libraryEntityTitle">{s.name}</div>
                        {typeof s.book_count === "number" ? <div className="muted">{s.book_count} books</div> : null}
                      </div>
                      <CoverPreviewStrip books={s.preview_books} baseUrl={profile} onBookClick={onViewBook} />
                    </div>
                    );
                  })}
                </div>
              ) : null}

              {seriesData ? (
                <div className="libraryMetaRow">
                  <div className="muted">
                    <InlineMeta items={[`Page ${seriesPage}`, `${seriesData.count} series`]} />
                  </div>
                  <div className="pagerButtons">
                    <button
                      className="button buttonCompact"
                      type="button"
                      onClick={() => handlePageChange(Math.max(1, seriesPage - 1))}
                      disabled={seriesBusy || !seriesData.previous}
                    >
                      Previous
                    </button>
                    <button
                      className="button buttonCompact"
                      type="button"
                      onClick={() => handlePageChange(seriesPage + 1)}
                      disabled={seriesBusy || !seriesData.next}
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <>
              {authorsError ? <p className="errorText">{authorsError}</p> : null}
              {authorsBusy && !authorsData ? <div className="muted" style={{ marginTop: 10 }}>{`Loading${"\u2026"}`}</div> : null}

              {authorsData?.results?.length ? (
                <div className="libraryEntityList">
                  {authorsData.results.map((a) => {
                    const openAuthor = () => onShowAuthorBooks?.(String(a.id));
                    return (
                    <div
                      key={String(a.id)}
                      className="libraryEntityCard libraryEntityCardButton"
                      role="button"
                      tabIndex={0}
                      onClick={openAuthor}
                      onKeyDown={(event) => handleCardKeyDown(event, openAuthor)}
                      aria-label={`View books by ${a.name}`}
                      title={`View books by ${a.name}`}
                    >
                      <div className="libraryEntityMain">
                        <div className="libraryEntityTitle">{a.name}</div>
                        {typeof a.book_count === "number" ? <div className="muted">{a.book_count} books</div> : null}
                      </div>
                      <CoverPreviewStrip books={a.preview_books} baseUrl={profile} onBookClick={onViewBook} />
                    </div>
                    );
                  })}
                </div>
              ) : null}

              {authorsData ? (
                <div className="libraryMetaRow">
                  <div className="muted">
                    <InlineMeta items={[`Page ${authorsPage}`, `${authorsData.count} authors`]} />
                  </div>
                  <div className="pagerButtons">
                    <button
                      className="button buttonCompact"
                      type="button"
                      onClick={() => handlePageChange(Math.max(1, authorsPage - 1))}
                      disabled={authorsBusy || !authorsData.previous}
                    >
                      Previous
                    </button>
                    <button
                      className="button buttonCompact"
                      type="button"
                      onClick={() => handlePageChange(authorsPage + 1)}
                      disabled={authorsBusy || !authorsData.next}
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
