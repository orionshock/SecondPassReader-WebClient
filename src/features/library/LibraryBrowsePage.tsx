import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { ApiError } from "@secondpass/client";
import type { LibraryAuthor, LibraryBook, LibraryGroup, LibrarySeries, PaginatedResponse, SecondPassClient } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { getConnectionStatus } from "../connection/connectionStatus";
import { BookResultsView } from "./display/BookResultsView";
import { BookViewModeToggle } from "./display/BookViewModeToggle";
import { CoverPreviewStrip } from "./display/CoverPreviewStrip";
import { InlineMeta } from "../../components/MetaSeparator";
import { MaterialIcon } from "../../components/MaterialIcon";
import { getLibraryBooksView, normalizeLibraryBooksView, saveLibraryBooksView, type LibraryBooksView } from "../../storage/libraryBooksView";

type BrowseMode = "books" | "series" | "authors" | "groups";

type Props = {
  profile: ConnectionProfile | null;
  spl: SecondPassClient | null;
  route: {
    q?: string;
    browse?: BrowseMode;
    seriesId?: string;
    authorId?: string;
    groupId?: string;
    view?: LibraryBooksView;
  };
  selectedBookId?: string | null;
  onViewBook?: (bookId: string) => void;
  onCommitSearch?: (q: string) => void;
  onShowBooks?: () => void;
  onShowSeries?: () => void;
  onShowAuthors?: () => void;
  onShowGroups?: () => void;
  onShowSeriesBooks?: (seriesId: string) => void;
  onShowAuthorBooks?: (authorId: string) => void;
  onShowGroupBooks?: (groupId: string) => void;
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
  onShowGroups,
  onShowSeriesBooks,
  onShowAuthorBooks,
  onShowGroupBooks,
}: Props) {
  const status = useMemo(() => getConnectionStatus(profile), [profile]);
  const apiReady = Boolean(spl);
  const groupsEnabled = profile?.advancedLibraryGroupsEnabled === true;

  const qFromRoute = (route.q ?? "").trim();
  const browseFromRoute = route.browse ?? "books";
  const browseMode: BrowseMode = qFromRoute
    ? "books"
    : browseFromRoute === "groups" && !groupsEnabled
      ? "books"
    : browseFromRoute === "series" || browseFromRoute === "authors" || browseFromRoute === "groups" || browseFromRoute === "books"
      ? browseFromRoute
      : "books";

  const [qDraft, setQDraft] = useState(qFromRoute);
  const [pageSize, setPageSize] = useState(20);
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

  const [groupsBusy, setGroupsBusy] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [groupsPage, setGroupsPage] = useState(1);
  const [groupsData, setGroupsData] = useState<PaginatedResponse<LibraryGroup> | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<LibraryGroup | null>(null);

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

  const loadBooks = useCallback(
    async (input: {
      page: number;
      q?: string;
      seriesId?: string;
      authorId?: string;
      groupId?: string;
      ordering: "title" | "series_index";
    }) => {
      if (!spl) return;

      setBooksBusy(true);
      setBooksError(null);
      try {
        const result = input.groupId
          ? await spl.library.groups.books(input.groupId, {
              ordering: input.ordering,
              page: input.page,
              pageSize,
            })
          : await spl.library.books.list({
              q: input.q?.trim() ? input.q.trim() : undefined,
              series: input.seriesId,
              author: input.authorId,
              ordering: input.ordering,
              page: input.page,
              pageSize,
            });
        setBooksData(result);
        setBooksPage(input.page);
      } catch (e) {
        if (e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")) {
          setBooksError(
            "Your reader client is linked, but this token is not allowed to access the library. It may be revoked, lack permissions, or the server may not support reader-token library access yet.",
          );
        } else {
          setBooksError(e instanceof Error ? e.message : "Failed to load library.");
        }
        setBooksData(null);
      } finally {
        setBooksBusy(false);
      }
    },
    [pageSize, spl],
  );

  const loadSeries = useCallback(
    async (page: number) => {
      if (!spl) return;
      setSeriesBusy(true);
      setSeriesError(null);
      try {
        const r = await spl.library.series.list({ page, includePreviewBooks: true });
        setSeriesData(r);
        setSeriesPage(page);
      } catch (e) {
        setSeriesData(null);
        setSeriesError(e instanceof Error ? e.message : "Failed to load series.");
      } finally {
        setSeriesBusy(false);
      }
    },
    [spl],
  );

  const loadAuthors = useCallback(
    async (page: number) => {
      if (!spl) return;
      setAuthorsBusy(true);
      setAuthorsError(null);
      try {
        const r = await spl.library.authors.list({ page, includePreviewBooks: true });
        setAuthorsData(r);
        setAuthorsPage(page);
      } catch (e) {
        setAuthorsData(null);
        setAuthorsError(e instanceof Error ? e.message : "Failed to load authors.");
      } finally {
        setAuthorsBusy(false);
      }
    },
    [spl],
  );

  const loadGroups = useCallback(
    async (page: number) => {
      if (!spl) return;
      setGroupsBusy(true);
      setGroupsError(null);
      try {
        const r = await spl.library.groups.list({ page, includePreviewBooks: true });
        setGroupsData(r);
        setGroupsPage(page);
      } catch (e) {
        setGroupsData(null);
        setGroupsError(e instanceof Error ? e.message : "Failed to load groups.");
      } finally {
        setGroupsBusy(false);
      }
    },
    [spl],
  );

  useEffect(() => {
    setBooksData(null);
    setBooksError(null);
    setBooksBusy(false);
    setBooksPage(1);
  }, [qFromRoute, browseMode, route.seriesId, route.authorId, route.groupId, pageSize]);

  useEffect(() => {
    if (status !== "verified") return;
    if (!apiReady || !spl) return;

    // Global search wins over browse.
    if (qFromRoute) {
      void loadBooks({ page: 1, q: qFromRoute, ordering: "title" });
      return;
    }

    if (browseMode === "series" && route.seriesId) {
      void loadBooks({ page: 1, seriesId: route.seriesId, ordering: "series_index" });
      return;
    }

    if (browseMode === "authors" && route.authorId) {
      void loadBooks({ page: 1, authorId: route.authorId, ordering: "title" });
      return;
    }

    if (browseMode === "groups" && route.groupId) {
      void loadBooks({ page: 1, groupId: route.groupId, ordering: "title" });
      return;
    }

    if (browseMode === "books") {
      void loadBooks({ page: 1, ordering: "title" });
      return;
    }

    if (browseMode === "series" && !route.seriesId && !seriesData && !seriesBusy) void loadSeries(1);
    if (browseMode === "authors" && !route.authorId && !authorsData && !authorsBusy) void loadAuthors(1);
    if (browseMode === "groups" && groupsEnabled && !route.groupId && !groupsData && !groupsBusy) void loadGroups(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, apiReady, qFromRoute, browseMode, route.seriesId, route.authorId, route.groupId, groupsEnabled]);

  useEffect(() => {
    if (status !== "verified") return;
    if (!apiReady || !spl) return;
    if (qFromRoute) {
      setSelectedSeries(null);
      setSelectedAuthor(null);
      setSelectedGroup(null);
      return;
    }

    if (browseMode === "series" && route.seriesId) {
      void (async () => {
        try {
          const s = await spl.library.series.get(route.seriesId!, { includePreviewBooks: true });
          setSelectedSeries(s);
        } catch {
          setSelectedSeries(null);
        }
      })();
    } else {
      setSelectedSeries(null);
    }

    if (browseMode === "authors" && route.authorId) {
      void (async () => {
        try {
          const a = await spl.library.authors.get(route.authorId!, { includePreviewBooks: true });
          setSelectedAuthor(a);
        } catch {
          setSelectedAuthor(null);
        }
      })();
    } else {
      setSelectedAuthor(null);
    }

    if (browseMode === "groups" && route.groupId && groupsEnabled) {
      void (async () => {
        try {
          const g = await spl.library.groups.get(route.groupId!, { includePreviewBooks: true });
          setSelectedGroup(g);
        } catch {
          setSelectedGroup(null);
        }
      })();
    } else {
      setSelectedGroup(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, apiReady, browseMode, route.seriesId, route.authorId, route.groupId, qFromRoute, spl, groupsEnabled]);

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

  const showBookList = Boolean(
    qFromRoute ||
      browseMode === "books" ||
      (browseMode === "series" && route.seriesId) ||
      (browseMode === "authors" && route.authorId) ||
      (browseMode === "groups" && route.groupId && groupsEnabled),
  );

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
                    setPageSize(Number(e.target.value));
                  }}
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>

              <button className="button buttonPrimary" type="button" onClick={handleCommitSearch} disabled={booksBusy}>
                {booksBusy ? "Searching..." : "Search"}
              </button>
            </div>
          </div>

          <div className="libraryBrowseTabs" role="tablist" aria-label="Browse by">
            <div className="libraryBrowseTabGroup">
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
              {groupsEnabled ? (
                <button
                  type="button"
                  className={`libraryBrowseTab ${browseMode === "groups" ? "libraryBrowseTabActive" : ""}`}
                  onClick={() => onShowGroups?.()}
                >
                  <MaterialIcon name="groups" />
                  Library Groups
                </button>
              ) : null}
            </div>

            {showBookList ? <BookViewModeToggle viewMode={bookViewMode} onChange={handleBookViewChange} /> : null}
          </div>

          {booksError ? <p className="errorText">{booksError}</p> : null}

          {showBookList ? (
            <>
              {browseMode === "series" && selectedSeries ? (
                <div className="libraryBrowseHeader">
                  <div>
                    <div className="panelTitle" style={{ margin: 0 }}>
                      {selectedSeries.name}
                    </div>
                    {selectedSeriesSummary ? <div className="libraryBrowseHeaderText">{selectedSeriesSummary}</div> : null}
                  </div>
                </div>
              ) : null}

              {browseMode === "authors" && selectedAuthor ? (
                <div className="libraryBrowseHeader">
                  <div>
                    <div className="panelTitle" style={{ margin: 0 }}>
                      {selectedAuthor.name}
                    </div>
                    {selectedAuthorBiography ? <div className="libraryBrowseHeaderText">{selectedAuthorBiography}</div> : null}
                  </div>
                </div>
              ) : null}

              {browseMode === "groups" && selectedGroup ? (
                <div className="libraryBrowseHeader">
                  <div className="libraryBrowseHeaderMain">
                    <div className="libraryGroupTitleLine">
                      <div className="panelTitle" style={{ margin: 0 }}>
                        {selectedGroup.name}
                      </div>
                      {selectedGroup.is_public_group ? <span className="libraryGroupChip libraryGroupChipPublic">Public</span> : null}
                      {selectedGroup.is_curator ? <span className="libraryGroupChip">Curator</span> : null}
                    </div>
                    {typeof selectedGroup.book_count === "number" ? (
                      <div className="muted">{selectedGroup.book_count} books</div>
                    ) : null}
                    {selectedGroup.description ? <div className="muted">{selectedGroup.description}</div> : null}
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
                        onClick={() =>
                          void loadBooks({
                            page: Math.max(1, booksPage - 1),
                            q: qFromRoute || undefined,
                            seriesId: browseMode === "series" ? route.seriesId : undefined,
                            authorId: browseMode === "authors" ? route.authorId : undefined,
                            groupId: browseMode === "groups" ? route.groupId : undefined,
                            ordering: browseMode === "series" ? "series_index" : "title",
                          })
                        }
                        disabled={booksBusy || !booksData.previous}
                      >
                        Previous
                      </button>
                      <button
                        className="button buttonCompact"
                        type="button"
                        onClick={() =>
                          void loadBooks({
                            page: booksPage + 1,
                            q: qFromRoute || undefined,
                            seriesId: browseMode === "series" ? route.seriesId : undefined,
                            authorId: browseMode === "authors" ? route.authorId : undefined,
                            groupId: browseMode === "groups" ? route.groupId : undefined,
                            ordering: browseMode === "series" ? "series_index" : "title",
                          })
                        }
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
                        onClick={() =>
                          void loadBooks({
                            page: Math.max(1, booksPage - 1),
                            q: qFromRoute || undefined,
                            seriesId: browseMode === "series" ? route.seriesId : undefined,
                            authorId: browseMode === "authors" ? route.authorId : undefined,
                            groupId: browseMode === "groups" ? route.groupId : undefined,
                            ordering: browseMode === "series" ? "series_index" : "title",
                          })
                        }
                        disabled={booksBusy || !booksData.previous}
                      >
                        Previous
                      </button>
                      <button
                        className="button buttonCompact"
                        type="button"
                        onClick={() =>
                          void loadBooks({
                            page: booksPage + 1,
                            q: qFromRoute || undefined,
                            seriesId: browseMode === "series" ? route.seriesId : undefined,
                            authorId: browseMode === "authors" ? route.authorId : undefined,
                            groupId: browseMode === "groups" ? route.groupId : undefined,
                            ordering: browseMode === "series" ? "series_index" : "title",
                          })
                        }
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
              {seriesBusy ? <div className="muted" style={{ marginTop: 10 }}>{`Loading${"\u2026"}`}</div> : null}

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
                      onClick={() => void loadSeries(Math.max(1, seriesPage - 1))}
                      disabled={seriesBusy || !seriesData.previous}
                    >
                      Previous
                    </button>
                    <button
                      className="button buttonCompact"
                      type="button"
                      onClick={() => void loadSeries(seriesPage + 1)}
                      disabled={seriesBusy || !seriesData.next}
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : browseMode === "authors" ? (
            <>
              {authorsError ? <p className="errorText">{authorsError}</p> : null}
              {authorsBusy ? <div className="muted" style={{ marginTop: 10 }}>{`Loading${"\u2026"}`}</div> : null}

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
                      onClick={() => void loadAuthors(Math.max(1, authorsPage - 1))}
                      disabled={authorsBusy || !authorsData.previous}
                    >
                      Previous
                    </button>
                    <button
                      className="button buttonCompact"
                      type="button"
                      onClick={() => void loadAuthors(authorsPage + 1)}
                      disabled={authorsBusy || !authorsData.next}
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <>
              {groupsError ? <p className="errorText">{groupsError}</p> : null}
              {groupsBusy ? <div className="muted" style={{ marginTop: 10 }}>{`Loading${"\u2026"}`}</div> : null}

              {groupsData?.results?.length ? (
                <div className="libraryEntityList">
                  {groupsData.results.map((g) => {
                    const openGroup = () => onShowGroupBooks?.(String(g.id));
                    return (
                    <div
                      key={String(g.id)}
                      className="libraryEntityCard libraryEntityCardButton"
                      role="button"
                      tabIndex={0}
                      onClick={openGroup}
                      onKeyDown={(event) => handleCardKeyDown(event, openGroup)}
                      aria-label={`View books in ${g.name}`}
                      title={`View books in ${g.name}`}
                    >
                      <div className="libraryEntityMain">
                        <div className="libraryGroupTitleLine">
                          <div className="libraryEntityTitle">{g.name}</div>
                          {g.is_public_group ? <span className="libraryGroupChip libraryGroupChipPublic">Public</span> : null}
                          {g.is_curator ? <span className="libraryGroupChip">Curator</span> : null}
                        </div>
                        {typeof g.book_count === "number" ? <div className="muted">{g.book_count} books</div> : null}
                        {g.description ? <div className="muted">{g.description}</div> : null}
                      </div>
                      <CoverPreviewStrip books={g.preview_books} baseUrl={profile} onBookClick={onViewBook} />
                    </div>
                    );
                  })}
                </div>
              ) : null}

              {groupsData ? (
                <div className="libraryMetaRow">
                  <div className="muted">
                    <InlineMeta items={[`Page ${groupsPage}`, `${groupsData.count} groups`]} />
                  </div>
                  <div className="pagerButtons">
                    <button
                      className="button buttonCompact"
                      type="button"
                      onClick={() => void loadGroups(Math.max(1, groupsPage - 1))}
                      disabled={groupsBusy || !groupsData.previous}
                    >
                      Previous
                    </button>
                    <button
                      className="button buttonCompact"
                      type="button"
                      onClick={() => void loadGroups(groupsPage + 1)}
                      disabled={groupsBusy || !groupsData.next}
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </section>
  );
}
