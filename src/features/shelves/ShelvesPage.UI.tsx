import { useCallback, useEffect, useRef, useState } from "react";
import { navigateTo } from "../../app/AppNavigation.Router";
import { APP_PAGE_SIZE_OPTIONS } from "../../app/AppNavigation.Constants";
import type { SecondPassClient, Shelf } from "@secondpass/client";
import type { ActiveConnection } from "../../storage/ActiveConnection.Store";
import { MaterialIcon } from "../../components/MaterialIcon.UI";
import { OrderingControl, type OrderingOption } from "../../components/OrderingControl.UI";
import { CollectionPagination } from "../../components/CollectionPagination.UI";
import { PreviewBookCoverStack } from "../library/display/PreviewBookCoverStack.UI";
import { normalizePreviewBooks } from "../library/display/PreviewBooks.Mapper";
import { ShelfForm } from "./ShelfForm.UI";
import { canEditShelf, ShelfMetaLine } from "./ShelfMetadata.Presenter";
import { getAuthRecoveryMessage, getPageLoadErrorMessage } from "../../app/AppUserFacingErrors.Mapper";
import { PageLoadErrorNotice } from "../../app/AppPageLoadErrorNotice.UI";
import { useModalDialogFocus } from "../../components/ModalDialogFocus.Lifecycle";
import { useShelfCollection, type ShelfScope } from "./ShelfCollection.Controller";

type ShelfOrdering = "name" | "-item_count";

const SHELF_ORDERING_OPTIONS: Array<OrderingOption<ShelfOrdering>> = [
  { value: "name", label: "Shelf A-Z", icon: "sort_by_alpha" },
  { value: "-item_count", label: "Most books", icon: "format_list_numbered" },
];
const SHELF_SCOPES: Array<{ value: ShelfScope; label: string; icon: string; empty: string; searchEmpty: string; searchPlaceholder: string }> = [
  { value: "personal", label: "Personal", icon: "shelves", empty: "You do not have any personal shelves.", searchEmpty: "No personal shelves match this search.", searchPlaceholder: "Search shelves" },
  { value: "shared", label: "Shared by Others", icon: "share", empty: "No shelves shared by others.", searchEmpty: "No shared shelves match this search.", searchPlaceholder: "Search shelves or users" },
  { value: "group", label: "Group Shelves", icon: "group_work", empty: "No group shelves.", searchEmpty: "No group shelves match this search.", searchPlaceholder: "Search shelves or groups" },
];

export function ShelvesLoadErrorNotice({
  error,
  disabled,
  onRetry,
}: {
  error: unknown;
  disabled: boolean;
  onRetry: () => void;
}) {
  return (
    <PageLoadErrorNotice
      error={error}
      message={getPageLoadErrorMessage(
        error,
        "Couldn't load shelves.",
        getAuthRecoveryMessage("access shelves"),
      )}
      onRetry={onRetry}
      retryDisabled={disabled}
    />
  );
}

export function ShelvesPage({
  connection,
  spl,
  scope: routeScope,
  q: routeQuery,
  ordering: routeOrdering,
  onChangeScope,
  onCommitSearch,
  onChangeOrdering,
  onViewBook,
}: {
  connection: ActiveConnection | null;
  spl: SecondPassClient | null;
  scope?: ShelfScope;
  q?: string;
  ordering?: string;
  onChangeScope?: (scope: ShelfScope) => void;
  onCommitSearch?: (q: string) => void;
  onChangeOrdering?: (ordering: string) => void;
  onViewBook?: (bookId: string) => void;
}) {
  const activeScope = routeScope ?? "personal";
  const submittedQuery = routeQuery?.trim() ?? "";
  const [searchDraft, setSearchDraft] = useState(submittedQuery);
  const [displayScope, setDisplayScope] = useState<ShelfScope>("personal");
  const ordering = SHELF_ORDERING_OPTIONS.some((option) => option.value === routeOrdering) ? (routeOrdering as ShelfOrdering) : "name";
  const {
    canLoad, busy, pages, pageSize, changePageSize, createOpen, createDraft, menuShelfId, mutationBusy, mutationError,
    createShelf, deleteShelf, beginCreate, cancelCreate, changeCreateDraft, toggleMenu, dismissMenu,
  } = useShelfCollection({ spl, q: submittedQuery, ordering, activeScope });
  const requestedPage = pages[activeScope];
  const visibleScope = requestedPage.data || requestedPage.error ? activeScope : displayScope;
  const activePage = pages[visibleScope];
  const activeScopeInfo = SHELF_SCOPES.find((scope) => scope.value === visibleScope)!;
  useEffect(() => {
    if (requestedPage.data || requestedPage.error) setDisplayScope(activeScope);
  }, [activeScope, requestedPage.data, requestedPage.error]);
  useEffect(() => {
    setSearchDraft(submittedQuery);
  }, [submittedQuery]);
  const createDialogRef = useRef<HTMLElement | null>(null);
  const createDialogCloseRef = useRef<HTMLButtonElement | null>(null);
  useModalDialogFocus({
    active: createOpen,
    dialogRef: createDialogRef,
    initialFocusRef: createDialogCloseRef,
    onDismiss: cancelCreate,
    dismissDisabled: mutationBusy,
  });

  const renderShelf = useCallback((shelf: Shelf) => {
    const canEdit = canEditShelf(shelf);
    const menuOpen = menuShelfId === shelf.id;
    const openShelf = () => navigateTo({ kind: "shelf", shelfId: shelf.id });
    return (
      <div
        key={shelf.id}
        className="shelfCard"
        onClick={openShelf}
      >
        <button type="button" className="shelfCardMain shelfCardButton" aria-label={`Open shelf ${shelf.name}`}>
          <span className="shelfCardTitle">{shelf.name}</span>
          <span className="muted">
            <ShelfMetaLine shelf={shelf} showOwner={visibleScope !== "personal"} />
          </span>
        </button>
        <div className="shelfCardRight">
          <PreviewBookCoverStack
            previewBooks={normalizePreviewBooks(shelf.preview_books)}
            baseUrl={connection}
            onBookClick={(bookId) => {
              if (onViewBook) onViewBook(bookId);
              else navigateTo({ kind: "shelves", bookId });
            }}
          />
          {canEdit ? (
            <div
              className="shelfCardActions"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <div className="shelfOverflow">
                <button
                  type="button"
                  className="button buttonCompact shelfIconButton"
                  onClick={() => toggleMenu(shelf.id)}
                  disabled={mutationBusy}
                  aria-label={`More actions for ${shelf.name}`}
                  aria-expanded={menuOpen}
                  title="More actions"
                >
                  <MaterialIcon name="more_vert" />
                </button>
                {menuOpen ? (
                  <div className="shelfOverflowMenu" role="group" aria-label={`Actions for ${shelf.name}`}>
                    <button
                      type="button"
                      className="shelfOverflowItem"
                      onClick={() => {
                        dismissMenu();
                        navigateTo({ kind: "shelfEdit", shelfId: shelf.id });
                      }}
                      disabled={mutationBusy}
                    >
                      <MaterialIcon name="edit" />
                      Edit
                    </button>
                    <button
                      type="button"
                      className="shelfOverflowItem shelfOverflowItemDanger"
                      onClick={() => void deleteShelf(shelf)}
                      disabled={mutationBusy}
                    >
                      <MaterialIcon name="delete" />
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }, [visibleScope, deleteShelf, dismissMenu, menuShelfId, mutationBusy, connection, onViewBook, toggleMenu]);

  const formOpen = createOpen;

  return (
    <section className="panel shelvesSection">
      <div className="panelHeaderRow">
        <h1 className="panelTitle">Shelves</h1>
        <div className="shelfHeaderControls">
          {canLoad ? (
            <button
              type="button"
              className="button buttonPrimary buttonCompact"
              onClick={beginCreate}
              disabled={busy || mutationBusy || formOpen}
            >
              Create personal shelf
            </button>
          ) : null}
        </div>
      </div>

      {!canLoad ? <p className="muted">Verify the connection to view shelves.</p> : null}
      {mutationError && !formOpen ? <div className="errorText">{mutationError}</div> : null}

      {formOpen ? (
        <div
          className="modalOverlay shelfModalOverlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !mutationBusy) {
              cancelCreate();
            }
          }}
        >
          <section ref={createDialogRef} className="modalPanel shelfModalPanel" role="dialog" aria-modal="true" aria-labelledby="shelf-form-title" tabIndex={-1}>
            <div className="modalHeaderRow">
              <div className="modalTitle" id="shelf-form-title">
                Create personal shelf
              </div>
              <button
                ref={createDialogCloseRef}
                type="button"
                className="button buttonCompact shelfIconButton"
                onClick={cancelCreate}
                disabled={mutationBusy}
                aria-label="Close"
                title="Close"
              >
                <MaterialIcon name="close" />
              </button>
            </div>
            <div className="modalBody">
              <p className="muted shelfModalHint">Library Group shelves are read-only here.</p>
              <ShelfForm
                values={createDraft}
                onChange={changeCreateDraft}
                onSubmit={() => void createShelf()}
                onCancel={cancelCreate}
                submitLabel="Create personal shelf"
                busy={mutationBusy}
                descriptionError={mutationError}
              />
            </div>
          </section>
        </div>
      ) : null}

      {canLoad ? (
        <div>
          <div className="shelfScopeControls" role="group" aria-label="Shelf scope">
            {SHELF_SCOPES.map((scope) => (
              <button key={scope.value} type="button" className={`button buttonCompact shelfScopeButton${visibleScope === scope.value ? " shelfScopeButtonActive" : ""}${activeScope === scope.value && visibleScope !== activeScope ? " shelfScopeButtonPending" : ""}`} aria-label={scope.label} aria-pressed={visibleScope === scope.value} aria-busy={activeScope === scope.value && visibleScope !== activeScope} onClick={() => {
                setSearchDraft("");
                onChangeScope?.(scope.value);
              }}>
                <MaterialIcon name={scope.icon} />{scope.label}
              </button>
            ))}
          </div>
          <form
            className="shelfSearchForm"
            onSubmit={(event) => {
              event.preventDefault();
              onCommitSearch?.(searchDraft.trim());
            }}
          >
            <label className="toolbarField toolbarSearch shelfSearchField">
              <span className="srOnly">{SHELF_SCOPES.find((scope) => scope.value === activeScope)!.searchPlaceholder}</span>
              <input
                className="input inputCompact"
                type="search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder={SHELF_SCOPES.find((scope) => scope.value === activeScope)!.searchPlaceholder}
                aria-label={SHELF_SCOPES.find((scope) => scope.value === activeScope)!.searchPlaceholder}
              />
            </label>
            <button className="button buttonPrimary" type="submit">Search</button>
          </form>
          <section className="shelfList" aria-label={activeScopeInfo.label}>
            {activePage.busy && !activePage.data ? <p className="muted">Loading {activeScopeInfo.label.toLowerCase()} shelves...</p> : null}
            {activePage.error ? <ShelvesLoadErrorNotice error={activePage.error} onRetry={() => void activePage.retry()} disabled={activePage.busy} /> : null}
            {activePage.data?.count === 0 && !activePage.error ? <p className="muted">{activePage.dataQuery ? activeScopeInfo.searchEmpty : activeScopeInfo.empty}</p> : null}
            <ShelfCollectionPager
              title={activeScopeInfo.label}
              section={activePage}
              pageSize={pageSize}
              onPageSizeChange={changePageSize}
              ordering={ordering}
              onChangeOrdering={onChangeOrdering}
            />
            {activePage.data?.results.map(renderShelf)}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function ShelfCollectionPager({ title, section, pageSize, onPageSizeChange, ordering, onChangeOrdering }: {
  title: string;
  section: ReturnType<typeof useShelfCollection>["pages"][ShelfScope];
  pageSize: number;
  onPageSizeChange: (pageSize: number) => void;
  ordering: ShelfOrdering;
  onChangeOrdering?: (ordering: string) => void;
}) {
  const sortControl = <OrderingControl options={SHELF_ORDERING_OPTIONS} value={ordering} onChange={(value) => onChangeOrdering?.(value)} ariaLabel="Sort shelves" />;
  if (!section.data) return <div className="shelfCollectionPager">{sortControl}</div>;
  const hasPrevious = section.page > 1;
  const hasNext = Boolean(section.data.next) || section.page * pageSize < section.data.count;
  return (
    <nav className="shelfCollectionPager" aria-label={`${title} pages`}>
      <CollectionPagination
        page={section.page}
        total={section.data.count}
        pageSize={{ value: pageSize, options: APP_PAGE_SIZE_OPTIONS, onChange: onPageSizeChange }}
        busy={section.busy}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        onPrevious={section.previous}
        onNext={section.next}
        contextControls={sortControl}
        previousAriaLabel={`Previous page of ${title}`}
        nextAriaLabel={`Next page of ${title}`}
      />
    </nav>
  );
}
