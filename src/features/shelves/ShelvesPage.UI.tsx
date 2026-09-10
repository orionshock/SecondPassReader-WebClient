import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { navigateTo } from "../../app/AppNavigation.Router";
import type { SecondPassClient, Shelf } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";
import { MaterialIcon } from "../../components/MaterialIcon.UI";
import { OrderingControl, type OrderingOption } from "../../components/OrderingControl.UI";
import { PreviewBookCoverStack } from "../library/display/PreviewBookCoverStack.UI";
import { normalizePreviewBooks } from "../library/display/PreviewBooks.Mapper";
import { createPersonalShelfInput, ShelfForm, type ShelfFormValues } from "./ShelfForm.UI";
import { canEditShelf, ShelfMetaLine } from "./ShelfMetadata.Presenter";
import { getAuthRecoveryMessage, getPageLoadErrorMessage } from "../../app/AppUserFacingErrors.Mapper";
import { PageLoadErrorNotice } from "../../app/AppPageLoadErrorNotice.UI";

type ShelfOrdering = "name" | "-item_count";

const SHELF_ORDERING_OPTIONS: Array<OrderingOption<ShelfOrdering>> = [
  { value: "name", label: "Shelf A-Z", icon: "sort_by_alpha" },
  { value: "-item_count", label: "Most books", icon: "format_list_numbered" },
];

function shelfToFormValues(shelf?: Shelf | null): ShelfFormValues {
  return {
    name: shelf?.name ?? "",
    description: shelf?.description ?? "",
    visibility: shelf?.visibility === "listed" ? "listed" : "private",
  };
}

type ScopedShelves = {
  personal: Shelf[];
  shared: Shelf[];
};

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
        "Could not load shelves.",
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
  const canLoad = Boolean(spl);
  const ordering = SHELF_ORDERING_OPTIONS.some((option) => option.value === routeOrdering) ? (routeOrdering as ShelfOrdering) : "name";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [data, setData] = useState<ScopedShelves | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<ShelfFormValues>(() => shelfToFormValues());
  const [menuShelfId, setMenuShelfId] = useState<string | null>(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const loadRequestSeq = useRef(0);

  const load = useCallback(async () => {
    if (!spl) return;
    const requestSeq = ++loadRequestSeq.current;
    setBusy(true);
    setError(null);
    try {
      const [personal, shared] = await Promise.all([
        spl.shelves.list({ scope: "personal", includePreviewBooks: true, ordering, page, pageSize }),
        spl.shelves.list({ scope: "shared", includePreviewBooks: true, ordering, page, pageSize }),
      ]);
      if (requestSeq !== loadRequestSeq.current) return;
      setData({
        personal: personal.results ?? [],
        shared: shared.results ?? [],
      });
    } catch (e) {
      if (requestSeq !== loadRequestSeq.current) return;
      setError(e instanceof Error ? e : new Error("Could not load shelves."));
    } finally {
      if (requestSeq === loadRequestSeq.current) setBusy(false);
    }
  }, [ordering, page, pageSize, spl]);

  useEffect(() => {
    setError(null);
    setBusy(false);
    setCreateOpen(false);
    setMenuShelfId(null);
    setMutationError(null);
    if (!canLoad) return;
    void load();
  }, [canLoad, load]);

  const handleCreate = useCallback(async () => {
    if (!spl) return;
    const name = createDraft.name.trim();
    if (!name) return;
    setMutationBusy(true);
    setMutationError(null);
    try {
      await spl.shelves.create(createPersonalShelfInput(createDraft));
      setCreateOpen(false);
      setCreateDraft(shelfToFormValues());
      setMenuShelfId(null);
      await load();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : "Failed to create shelf.");
    } finally {
      setMutationBusy(false);
    }
  }, [createDraft, load, spl]);

  const handleDelete = useCallback(async (shelf: Shelf) => {
    if (!spl || !canEditShelf(shelf)) return;
    if (!window.confirm("Delete this shelf? Books and files will not be deleted.")) return;
    setMutationBusy(true);
    setMutationError(null);
    try {
      await spl.shelves.remove(shelf.id);
      setMenuShelfId(null);
      await load();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : "Failed to delete shelf.");
    } finally {
      setMutationBusy(false);
    }
  }, [load, spl]);

  const handleCardKeyDown = useCallback((event: KeyboardEvent<HTMLElement>, action: () => void) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    action();
  }, []);

  const renderShelf = useCallback((shelf: Shelf) => {
    const canEdit = canEditShelf(shelf);
    const menuOpen = menuShelfId === shelf.id;
    const openShelf = () => navigateTo({ kind: "shelf", shelfId: shelf.id });
    return (
      <div
        key={shelf.id}
        className="shelfCard shelfCardButton"
        role="button"
        tabIndex={0}
        onClick={openShelf}
        onKeyDown={(event) => handleCardKeyDown(event, openShelf)}
        aria-label={`Open shelf ${shelf.name}`}
        title={`Open shelf ${shelf.name}`}
      >
        <div className="shelfCardMain">
          <div className="shelfCardTitle">{shelf.name}</div>
          <div className="muted">
            <ShelfMetaLine shelf={shelf} />
          </div>
        </div>
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
                  onClick={() => setMenuShelfId((current) => (current === shelf.id ? null : shelf.id))}
                  disabled={mutationBusy}
                  aria-label={`More actions for ${shelf.name}`}
                  aria-expanded={menuOpen}
                  title="More actions"
                >
                  <MaterialIcon name="more_vert" />
                </button>
                {menuOpen ? (
                  <div className="shelfOverflowMenu" role="menu">
                    <button
                      type="button"
                      className="shelfOverflowItem"
                      onClick={() => {
                        setMenuShelfId(null);
                        navigateTo({ kind: "shelfEdit", shelfId: shelf.id });
                      }}
                      disabled={mutationBusy}
                      role="menuitem"
                    >
                      <MaterialIcon name="edit" />
                      Edit
                    </button>
                    <button
                      type="button"
                      className="shelfOverflowItem shelfOverflowItemDanger"
                      onClick={() => void handleDelete(shelf)}
                      disabled={mutationBusy}
                      role="menuitem"
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
  }, [handleCardKeyDown, handleDelete, menuShelfId, mutationBusy, profile]);

  const formOpen = createOpen;

  return (
    <section className="panel shelvesSection">
      <div className="panelHeaderRow">
        <h2 className="panelTitle">Shelves</h2>
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
                onClick={() => {
                  setCreateOpen(true);
                  setCreateDraft(shelfToFormValues());
                  setMenuShelfId(null);
                  setMutationError(null);
                }}
                disabled={busy || mutationBusy || formOpen}
              >
                Create personal shelf
              </button>
            </>
          ) : null}
        </div>
      </div>

      {!canLoad ? <p className="muted">Select a verified profile first.</p> : null}
      {busy && !data ? <p className="muted">{`Loading${"\u2026"}`}</p> : null}
      {error ? (
        <ShelvesLoadErrorNotice
          error={error}
          onRetry={() => void load()}
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
              setCreateOpen(false);
              setMutationError(null);
            }
          }}
        >
          <section className="modalPanel shelfModalPanel" role="dialog" aria-modal="true" aria-labelledby="shelf-form-title">
            <div className="modalHeaderRow">
              <div className="modalTitle" id="shelf-form-title">
                Create personal shelf
              </div>
              <button
                type="button"
                className="button buttonCompact shelfIconButton"
                onClick={() => {
                  setCreateOpen(false);
                  setMutationError(null);
                }}
                disabled={mutationBusy}
                aria-label="Close"
                title="Close"
              >
                <MaterialIcon name="close" />
              </button>
            </div>
            <div className="modalBody">
              <p className="muted shelfModalHint">Group shelves cannot be edited here.</p>
              <ShelfForm
                values={createDraft}
                onChange={setCreateDraft}
                onSubmit={() => void handleCreate()}
                onCancel={() => {
                  setCreateOpen(false);
                  setMutationError(null);
                }}
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
            <h3 className="panelTitle" style={{ margin: "6px 0 8px" }}>
              My shelves
            </h3>
            {data.personal.length === 0 ? <div className="muted">No shelves in this section.</div> : null}
            {data.personal.map(renderShelf)}
          </div>

          <div>
            <h3 className="panelTitle" style={{ margin: "6px 0 8px" }}>
              Shared shelves
            </h3>
            {data.shared.length === 0 ? <div className="muted">No shelves in this section.</div> : null}
            {data.shared.map(renderShelf)}
          </div>
        </div>
      ) : null}
    </section>
  );
}
