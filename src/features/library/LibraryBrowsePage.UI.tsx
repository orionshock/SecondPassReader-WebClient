import { useCallback, useEffect, useMemo, useState } from "react";
import type { SecondPassClient } from "@secondpass/client";
import type { ActiveConnection } from "../../storage/ActiveConnection.Store";
import { getConnectionStatus } from "../connection/ConnectionStatus.Presenter";
import type { OrderingOption } from "../../components/OrderingControl.UI";
import { getLibraryBooksView, normalizeLibraryBooksView, saveLibraryBooksView, type LibraryBooksView } from "../../storage/LibraryBooksView.Store";
import { CatalogTagRail } from "./catalogTags/CatalogTagRail.UI";
import { LibraryScopeControl } from "./libraryScope/LibraryScopeControl.UI";
import { useLibraryAxisResults } from "./data/LibraryAxisResults.Controller";
import { useSelectedLibraryEntity } from "./data/SelectedLibraryEntity.Controller";
import { deriveLibraryRouteState, type LibraryAxis, type LibraryBookOrdering, type LibraryEntityOrdering } from "./route/LibraryRoute.State";
import { LibraryAxisTabs } from "./controls/LibraryAxisTabs.UI";
import { LibrarySearchControls } from "./controls/LibrarySearchControls.UI";
import { getLibrarySearchPlaceholder } from "./controls/LibrarySearchPlaceholder.Presenter";
import { LibrarySortViewControls } from "./controls/LibrarySortViewControls.UI";
import { LibraryAuthorRows } from "./results/LibraryAuthorRows.UI";
import { LibraryBooksResults } from "./results/LibraryBooksResults.UI";
import { LibrarySelectedAxisHeader } from "./results/LibrarySelectedAxisHeader.UI";
import { LibrarySeriesRows } from "./results/LibrarySeriesRows.UI";
import { LibraryResultsLoadErrorNotice } from "./LibraryResultsLoadErrorNotice.UI";

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
  connection: ActiveConnection | null;
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
  onSelectGroup?: (groupId: string | null) => void;
  onRemoveUnavailableGroup?: () => void;
  onSelectTag?: (tag: string | null) => void;
  onChangeOrdering?: (ordering: string) => void;
  onChangePageSize?: (pageSize: number) => void;
  onChangePage?: (page: number) => void;
};

export function LibraryBrowsePage({
  connection,
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
  onSelectGroup,
  onRemoveUnavailableGroup,
  onSelectTag,
  onChangeOrdering,
  onChangePageSize,
  onChangePage,
}: Props) {
  const status = useMemo(() => getConnectionStatus(connection), [connection]);
  const apiReady = Boolean(spl);
  const advancedGroupsEnabled = connection?.advancedLibraryGroupsEnabled === true;
  const routeState = useMemo(
    () => deriveLibraryRouteState(route, advancedGroupsEnabled),
    [advancedGroupsEnabled, route.authorId, route.browse, route.groupId, route.ordering, route.page, route.pageSize, route.q, route.searchMode, route.seriesId, route.tag],
  );
  const { axis: browseMode, effectiveGroupId, pageSize, q: qFromRoute = "", tag: tagSlug } = routeState;
  const bookOrderingOptions = routeState.selectedSeriesId ? SERIES_BOOK_ORDERING_OPTIONS : BOOK_ORDERING_OPTIONS;
  const bookOrdering = routeState.resultKind === "books" ? routeState.ordering as BookOrdering : "title";
  const seriesOrdering = routeState.resultKind === "series" ? routeState.ordering as EntityOrdering : "name";
  const authorsOrdering = routeState.resultKind === "authors" ? routeState.ordering as EntityOrdering : "name";

  const [qDraft, setQDraft] = useState(qFromRoute);
  const [scopeName, setScopeName] = useState<string | undefined>();
  const [bookViewMode, setBookViewMode] = useState<LibraryBooksView>(() => normalizeLibraryBooksView(route.view) ?? getLibraryBooksView());

  const activeResult = useLibraryAxisResults({ spl, state: routeState, canLoad: status === "verified" && apiReady });
  const showBookList = activeResult.kind === "books";
  const selectedEntity = useSelectedLibraryEntity({
    spl,
    selectedAuthorId: routeState.selectedAuthorId,
    selectedSeriesId: routeState.selectedSeriesId,
    canLoad: status === "verified" && apiReady,
  });
  const { selectedAuthorData: selectedAuthor, selectedSeriesData: selectedSeries } = selectedEntity;

  useEffect(() => {
    setQDraft(qFromRoute);
  }, [qFromRoute]);
  const catalogResult = activeResult.data;

  useEffect(() => {
    if (!advancedGroupsEnabled && route.groupId) onRemoveUnavailableGroup?.();
  }, [advancedGroupsEnabled, onRemoveUnavailableGroup, route.groupId]);

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
      onChangeOrdering?.(ordering);
    },
    [onChangeOrdering],
  );

  const handleSeriesOrderingChange = useCallback(
    (ordering: EntityOrdering) => onChangeOrdering?.(ordering),
    [onChangeOrdering],
  );

  const handleAuthorsOrderingChange = useCallback(
    (ordering: EntityOrdering) => onChangeOrdering?.(ordering),
    [onChangeOrdering],
  );

  const handlePageSizeChange = useCallback(
    (nextPageSize: number) => onChangePageSize?.(nextPageSize),
    [onChangePageSize],
  );

  const handlePageChange = useCallback(
    (page: number) => onChangePage?.(page),
    [onChangePage],
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
      <h1 className="srOnly">Library</h1>
      {status === "not_configured" ? <p className="muted">Connect to Second Pass Library to use Library.</p> : null}
      {status === "configured" ? <p className="muted">Approve this browser before loading Library.</p> : null}
      {status === "linked" ? <p className="muted">Verify the connection before loading Library.</p> : null}

      {status === "verified" ? (
        <>
          <LibrarySearchControls
            draft={qDraft}
            placeholder={searchPlaceholder}
            onDraftChange={setQDraft}
            onSearch={handleCommitSearch}
          />

          <div className="libraryBrowseTabs">
            <div className="libraryBrowseTabGroup">
              {spl && advancedGroupsEnabled ? (
                <LibraryScopeControl
                  spl={spl}
                  groupId={effectiveGroupId}
                  onSelectedNameChange={setScopeName}
                  onChange={(groupId) => onSelectGroup?.(groupId ?? null)}
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
                catalogResult={catalogResult}
                selectedSlug={tagSlug}
                onSelect={(slug) => onSelectTag?.(slug ?? null)}
              />
            ) : null}
            <div
              id="library-axis-results"
              className="libraryCatalogResults"
              role="tabpanel"
              aria-labelledby={`library-axis-${browseMode}-tab`}
            >
              {activeResult.kind === "books" ? (
                <>
                  {activeResult.error ? <LibraryResultsLoadErrorNotice error={activeResult.error} /> : null}
                  {browseMode === "series" && selectedSeries ? <LibrarySelectedAxisHeader kind="series" series={selectedSeries} /> : null}
                  {browseMode === "authors" && selectedAuthor ? <LibrarySelectedAxisHeader kind="author" author={selectedAuthor} /> : null}
                  <LibraryBooksResults
                    data={activeResult.data}
                    busy={activeResult.busy}
                    page={activeResult.page}
                    pageSize={pageSize}
                    viewMode={bookViewMode}
                    serverBaseUrl={connection?.serverBaseUrl}
                    selectedBookId={selectedBookId ? String(selectedBookId) : null}
                    onViewBook={(book) => onViewBook?.(String(book.id))}
                    onPageChange={handlePageChange}
                    onPageSizeChange={handlePageSizeChange}
                    hasError={Boolean(activeResult.error)}
                  />
                </>
              ) : activeResult.kind === "series" ? (
                <LibrarySeriesRows data={activeResult.data} busy={activeResult.busy} error={activeResult.error} page={activeResult.page} pageSize={pageSize} connection={connection} onSelectSeries={(seriesId) => onShowSeriesBooks?.(seriesId)} onViewBook={onViewBook} onPageChange={handlePageChange} onPageSizeChange={handlePageSizeChange} />
              ) : (
                <LibraryAuthorRows data={activeResult.data} busy={activeResult.busy} error={activeResult.error} page={activeResult.page} pageSize={pageSize} connection={connection} onSelectAuthor={(authorId) => onShowAuthorBooks?.(authorId)} onViewBook={onViewBook} onPageChange={handlePageChange} onPageSizeChange={handlePageSizeChange} />
              )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
