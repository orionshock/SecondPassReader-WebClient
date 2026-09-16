import { useMemo } from "react";
import type { SecondPassClient } from "@secondpass/client";
import { navigateTo } from "../../app/AppNavigation.Router";
import type { ActiveConnection } from "../../storage/ActiveConnection.Store";
import { MaterialIcon } from "../../components/MaterialIcon.UI";
import { useShelfEdit } from "./ShelfEdit.Controller";
import { ShelfEditInfoModal } from "./ShelfEditInfoModal.UI";
import { ShelfEditInfoPanel } from "./ShelfEditInfoPanel.UI";
import { ShelfEditItemsList } from "./ShelfEditItemsList.UI";

export function ShelfEditPage({ connection, spl, shelfId }: { connection: ActiveConnection | null; spl: SecondPassClient | null; shelfId: string }) {
  const {
    canLoad, busy, error, shelf, items, nextUrl, loadMoreBusy,
    mutationBusyId, mutationError, infoOpen, infoDraft, infoBusy, canEdit,
    loadMore, editInfo, cancelInfo, changeInfo, saveInfo, moveToPosition, moveItem, removeItem,
  } = useShelfEdit({ spl, shelfId });
  const itemCount = typeof shelf?.item_count === "number" ? Math.max(0, Math.floor(shelf.item_count)) : items.length;
  const positionOptions = useMemo(() => Array.from({ length: itemCount }, (_unused, index) => index), [itemCount]);
  return (
    <section className="panel shelfDetail shelfEditPage">
      <div className="panelHeaderRow">
        <h2 className="panelTitle" style={{ margin: 0 }}>
          {shelf?.name ? `Edit ${shelf.name}` : "Edit shelf"}
        </h2>
        <div className="shelfDetailHeaderActions">
          <button type="button" className="button buttonPrimary buttonCompact" onClick={() => navigateTo({ kind: "shelf", shelfId })}>
            <MaterialIcon name="done" />
            Done
          </button>
          <button type="button" className="button buttonCompact" onClick={() => navigateTo({ kind: "shelves" })}>
            All shelves
          </button>
        </div>
      </div>

      {!canLoad ? <p className="muted">Verify the connection to view this shelf.</p> : null}
      {busy ? <p className="muted">Loading shelf...</p> : null}
      {error ? <div className="errorText">{error}</div> : null}
      {mutationError && !infoOpen ? <div className="errorText">{mutationError}</div> : null}

      {shelf ? (
        <>
          {!canEdit ? (
            <div className="shelfReadOnlyNotice">
              This shelf is read-only for this account.
            </div>
          ) : null}

          <ShelfEditInfoPanel
            shelf={shelf}
            canEdit={canEdit}
            onChangeInfo={editInfo}
          />

          {canEdit ? (
            <ShelfEditItemsList
              items={items}
              connection={connection}
              itemCount={itemCount}
              positionOptions={positionOptions}
              mutationBusyId={mutationBusyId}
              onMove={(item, move) => void moveItem(item, move)}
              onMoveToPosition={(item, position) => void moveToPosition(item, position)}
              onRemove={(item) => void removeItem(item)}
            />
          ) : null}

          {nextUrl && canEdit ? (
            <div style={{ marginTop: 12 }}>
              <button type="button" className="button buttonCompact" onClick={() => void loadMore()} disabled={loadMoreBusy}>
                {loadMoreBusy ? `Loading${"\u2026"}` : "Load more"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {infoOpen && canEdit ? (
        <ShelfEditInfoModal
          values={infoDraft}
          busy={infoBusy}
          descriptionError={mutationError}
          onChange={changeInfo}
          onSave={() => void saveInfo()}
          onCancel={cancelInfo}
        />
      ) : null}
    </section>
  );
}
