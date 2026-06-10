import type { Shelf } from "@secondpass/client";
import { ShelfMetaLine } from "./shelfMeta";

export function ShelfEditInfoPanel({
  shelf,
  canEdit,
  onChangeInfo,
}: {
  shelf: Shelf;
  canEdit: boolean;
  onChangeInfo: () => void;
}) {
  return (
    <div className="shelfEditSummary">
      <div className="muted">
        <ShelfMetaLine shelf={shelf} />
      </div>
      {shelf.description ? <div className="muted">{shelf.description}</div> : null}
      {canEdit ? (
        <button type="button" className="button buttonCompact" onClick={onChangeInfo}>
          Change shelf info
        </button>
      ) : (
        <div className="muted">This shelf is read-only.</div>
      )}
    </div>
  );
}
