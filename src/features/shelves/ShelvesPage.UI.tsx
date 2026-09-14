import { useCallback, useRef } from "react";
import { navigateTo } from "../../app/AppNavigation.Router";
import type { SecondPassClient, Shelf } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";
import { MaterialIcon } from "../../components/MaterialIcon.UI";
import { OrderingControl, type OrderingOption } from "../../components/OrderingControl.UI";
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
  profile,
  spl,
  ordering: routeOrdering,
  page = 1,
  pageSize = 20,
  onUpdateRoute,
}: {
  profile: ConnectionProfile | null;
  spl: SecondPassClient | null;
  ordering?: string;
  page?: number;
  pageSize?: number;
  onUpdateRoute?: (patch: { ordering?: string; page?: number; pageSize?: number }) => void;
}) {
  const ordering = SHELF_ORDERING_OPTIONS.some((option) => option.value === routeOrdering) ? (routeOrdering as ShelfOrdering) : "name";
  const {
    canLoad, busy, error, data, createOpen, createDraft, menuShelfId, mutationBusy, mutationError,
    retry, createShelf, deleteShelf, beginCreate, cancelCreate, changeCreateDraft, toggleMenu, dismissMenu,
  } = useShelfCollection({ spl, ordering, page, pageSize });
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
            baseUrl={profile}
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
  }, [deleteShelf, dismissMenu, menuShelfId, mutationBusy, profile, toggleMenu]);

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
                onChange={(nextOrdering) => onUpdateRoute?.({ ordering: nextOrdering, page: 1, pageSize })}
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
      {busy && !data ? <p className="muted">Loading shelves...</p> : null}
      {error ? (
        <ShelvesLoadErrorNotice
          error={error}
          onRetry={() => void retry()}
          disabled={!canLoad || busy}
        />
      ) : null}
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

      {canLoad && !busy && !error && data && data.personal.length === 0 && data.shared.length === 0
        ? <p className="muted">No shelves yet.</p>
        : null}

      {data ? (
        <div className="shelfList">
          <div>
            <h2 className="panelTitle" style={{ margin: "6px 0 8px" }}>
              My shelves
            </h2>
            {data.personal.length === 0 ? <div className="muted">No personal shelves.</div> : null}
            {data.personal.map(renderShelf)}
          </div>

          <div>
            <h2 className="panelTitle" style={{ margin: "6px 0 8px" }}>
              Shared shelves
            </h2>
            {data.shared.length === 0 ? <div className="muted">No shared shelves.</div> : null}
            {data.shared.map(renderShelf)}
          </div>
        </div>
      ) : null}
    </section>
  );
}
