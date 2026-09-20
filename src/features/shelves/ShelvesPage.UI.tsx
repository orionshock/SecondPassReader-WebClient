import { useCallback, useRef } from "react";
import { navigateTo } from "../../app/AppNavigation.Router";
import type { SecondPassClient, Shelf } from "@secondpass/client";
import type { ActiveConnection } from "../../storage/ActiveConnection.Store";
import { MaterialIcon } from "../../components/MaterialIcon.UI";
import { OrderingControl, type OrderingOption } from "../../components/OrderingControl.UI";
import { LibraryPaginationControls } from "../library/controls/LibraryPaginationControls.UI";
import { PreviewBookCoverStack } from "../library/display/PreviewBookCoverStack.UI";
import { normalizePreviewBooks } from "../library/display/PreviewBooks.Mapper";
import { ShelfForm } from "./ShelfForm.UI";
import { canEditShelf, ShelfMetaLine } from "./ShelfMetadata.Presenter";
import { getAuthRecoveryMessage, getPageLoadErrorMessage } from "../../app/AppUserFacingErrors.Mapper";
import { PageLoadErrorNotice } from "../../app/AppPageLoadErrorNotice.UI";
import { useModalDialogFocus } from "../../components/ModalDialogFocus.Lifecycle";
import { useShelfCollection } from "./ShelfCollection.Controller";

type ShelfOrdering = "name" | "-item_count";

const SHELF_ORDERING_OPTIONS: Array<OrderingOption<ShelfOrdering>> = [
  { value: "name", label: "Shelf A-Z", icon: "sort_by_alpha" },
  { value: "-item_count", label: "Most books", icon: "format_list_numbered" },
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
  ordering: routeOrdering,
  onChangeOrdering,
}: {
  connection: ActiveConnection | null;
  spl: SecondPassClient | null;
  ordering?: string;
  onChangeOrdering?: (ordering: string) => void;
}) {
  const ordering = SHELF_ORDERING_OPTIONS.some((option) => option.value === routeOrdering) ? (routeOrdering as ShelfOrdering) : "name";
  const {
    canLoad, busy, personal, shared, createOpen, createDraft, menuShelfId, mutationBusy, mutationError,
    createShelf, deleteShelf, beginCreate, cancelCreate, changeCreateDraft, toggleMenu, dismissMenu,
  } = useShelfCollection({ spl, ordering });
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
      >
        <button type="button" className="shelfCardMain shelfCardButton" onClick={openShelf} aria-label={`Open shelf ${shelf.name}`}>
          <span className="shelfCardTitle">{shelf.name}</span>
          <span className="muted">
            <ShelfMetaLine shelf={shelf} />
          </span>
        </button>
        <div className="shelfCardRight">
          <PreviewBookCoverStack
            previewBooks={normalizePreviewBooks(shelf.preview_books)}
            baseUrl={connection}
            onBookClick={(bookId) => navigateTo({ kind: "shelves", bookId })}
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
  }, [deleteShelf, dismissMenu, menuShelfId, mutationBusy, connection, toggleMenu]);

  const formOpen = createOpen;

  return (
    <section className="panel shelvesSection">
      <div className="panelHeaderRow">
        <h1 className="panelTitle">Shelves</h1>
        <div className="shelfHeaderControls">
          {canLoad ? (
            <>
              <OrderingControl
                options={SHELF_ORDERING_OPTIONS}
                value={ordering}
                onChange={(nextOrdering) => onChangeOrdering?.(nextOrdering)}
                ariaLabel="Sort shelves"
              />
              <button
                type="button"
                className="button buttonPrimary buttonCompact"
                onClick={beginCreate}
                disabled={busy || mutationBusy || formOpen}
              >
                Create personal shelf
              </button>
            </>
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

      {canLoad && !busy && personal.data?.count === 0 && shared.data?.count === 0
        ? <p className="muted">No shelves yet.</p>
        : null}

      {canLoad ? (
        <div className="shelfList">
          <section aria-labelledby="personal-shelves-title">
            <h2 className="panelTitle" style={{ margin: "6px 0 8px" }}>
              <span id="personal-shelves-title">My shelves</span>
            </h2>
            {personal.busy && !personal.data ? <p className="muted">Loading personal shelves...</p> : null}
            {personal.busy && personal.data ? <p className="muted">Loading page {personal.requestedPage}...</p> : null}
            {personal.error ? <ShelvesLoadErrorNotice error={personal.error} onRetry={() => void personal.retry()} disabled={personal.busy} /> : null}
            {personal.data?.count === 0 && !personal.error ? <div className="muted">No personal shelves.</div> : null}
            {personal.data?.results.map(renderShelf)}
            <ShelfCollectionPager title="My shelves" section={personal} />
          </section>

          <section aria-labelledby="shared-shelves-title">
            <h2 className="panelTitle" style={{ margin: "6px 0 8px" }}>
              <span id="shared-shelves-title">Shared shelves</span>
            </h2>
            {shared.busy && !shared.data ? <p className="muted">Loading shared shelves...</p> : null}
            {shared.busy && shared.data ? <p className="muted">Loading page {shared.requestedPage}...</p> : null}
            {shared.error ? <ShelvesLoadErrorNotice error={shared.error} onRetry={() => void shared.retry()} disabled={shared.busy} /> : null}
            {shared.data?.count === 0 && !shared.error ? <div className="muted">No shared shelves.</div> : null}
            {shared.data?.results.map(renderShelf)}
            <ShelfCollectionPager title="Shared shelves" section={shared} />
          </section>
        </div>
      ) : null}
    </section>
  );
}

function ShelfCollectionPager({ title, section }: {
  title: string;
  section: ReturnType<typeof useShelfCollection>["personal"];
}) {
  if (!section.data || (!section.data.previous && !section.data.next)) return null;
  return (
    <nav aria-label={`${title} pages`}>
      <LibraryPaginationControls
        metaItems={[`Page ${section.page}`, `${section.data.count} shelves`]}
        busy={section.busy}
        hasPrevious={Boolean(section.data.previous)}
        hasNext={Boolean(section.data.next)}
        onPrevious={section.previous}
        onNext={section.next}
        previousAriaLabel={`Previous page of ${title}`}
        nextAriaLabel={`Next page of ${title}`}
      />
    </nav>
  );
}
