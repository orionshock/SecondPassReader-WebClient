import { useCallback, useEffect, useMemo, useState } from "react";
import type { SecondPassClient } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { getConnectionStatus } from "../connection/connectionStatus";
import type { OrderingOption } from "../../components/OrderingControl";
import { getLibraryBooksView, normalizeLibraryBooksView, saveLibraryBooksView, type LibraryBooksView } from "../../storage/libraryBooksView";
import { CatalogTagRail } from "./catalogTags/CatalogTagRail";
import { LibraryScopeControl } from "./libraryScope/LibraryScopeControl";
import { useLibraryAxisResults } from "./data/useLibraryAxisResults";
import { useSelectedLibraryEntity } from "./data/useSelectedLibraryEntity";
import { deriveLibraryRouteState, type LibraryAxis, type LibraryBookOrdering, type LibraryEntityOrdering } from "./route/libraryRouteState";
import { LibraryAxisTabs } from "./controls/LibraryAxisTabs";
import { LibrarySearchControls } from "./controls/LibrarySearchControls";
import { getLibrarySearchPlaceholder } from "./controls/librarySearchPlaceholder";
import { LibrarySortViewControls } from "./controls/LibrarySortViewControls";
import { LibraryAuthorRows } from "./results/LibraryAuthorRows";
import { LibraryBooksResults } from "./results/LibraryBooksResults";
import { LibrarySelectedAxisHeader } from "./results/LibrarySelectedAxisHeader";
import { LibrarySeriesRows } from "./results/LibrarySeriesRows";
import { LibraryResultsLoadErrorNotice } from "./LibraryResultsLoadErrorNotice";

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
    searchMode?: "axis" | "global";
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
    [advancedGroupsEnabled, route.authorId, route.browse, route.groupId, route.ordering, route.page, route.pageSize, route.q, route.searchMode, route.seriesId, route.tag],
  );
  const { axis: browseMode, effectiveGroupId, pageSize, q: qFromRoute = "", tag: tagSlug } = routeState;
  const showBookList = routeState.resultKind === "books";
  const bookOrderingOptions = routeState.selectedSeriesId ? SERIES_BOOK_ORDERING_OPTIONS : BOOK_ORDERING_OPTIONS;
  const bookOrdering = routeState.resultKind === "books" ? routeState.ordering as BookOrdering : "title";
  const seriesOrdering = routeState.resultKind === "series" ? routeState.ordering as EntityOrdering : "name";
  const authorsOrdering = routeState.resultKind === "authors" ? routeState.ordering as EntityOrdering : "name";

  const [qDraft, setQDraft] = useState(qFromRoute);
  const [scopeName, setScopeName] = useState<string | undefined>();
  const [bookViewMode, setBookViewMode] = useState<LibraryBooksView>(() => normalizeLibraryBooksView(route.view) ?? getLibraryBooksView());

  const axisResults = useLibraryAxisResults({ spl, state: routeState, canLoad: status === "verified" && apiReady });
  const selectedEntity = useSelectedLibraryEntity({
    spl,
    selectedAuthorId: routeState.selectedAuthorId,
    selectedSeriesId: routeState.selectedSeriesId,
    canLoad: status === "verified" && apiReady,
  });
  const { selectedAuthorData: selectedAuthor, selectedSeriesData: selectedSeries } = selectedEntity;
  const { data: booksData, busy: booksBusy, error: booksError, page: booksPage } = axisResults.books;
  const { data: seriesData, busy: seriesBusy, error: seriesError, page: seriesPage } = axisResults.series;
  const { data: authorsData, busy: authorsBusy, error: authorsError, page: authorsPage } = axisResults.authors;

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

  const handleCommitSearch = useCallback(() => {
    const next = qDraft.trim();
    onCommitSearch?.(next);
  }, [onCommitSearch, qDraft]);

  const searchPlaceholder = getLibrarySearchPlaceholder({
    axis: browseMode,
    scopeName: effectiveGroupId ? scopeName : undefined,
    searchMode: routeState.searchMode,
  });

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
            placeholder={searchPlaceholder}
            onDraftChange={setQDraft}
            onPageSizeChange={handlePageSizeChange}
            onSearch={handleCommitSearch}
          />

          <div className="libraryBrowseTabs">
            <div className="libraryBrowseTabGroup">
              {spl && advancedGroupsEnabled ? (
                <LibraryScopeControl
                  spl={spl}
                  groupId={effectiveGroupId}
                  onSelectedNameChange={setScopeName}
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
            <div
              id="library-axis-results"
              className="libraryCatalogResults"
              role="tabpanel"
              aria-labelledby={`library-axis-${browseMode}-tab`}
            >
              {booksError ? (
                <LibraryResultsLoadErrorNotice error={booksError} />
              ) : null}
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
                    hasError={Boolean(booksError)}
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
