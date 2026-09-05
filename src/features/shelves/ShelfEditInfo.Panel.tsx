import type { Shelf } from "@secondpass/client";
import { ServerRichText } from "../../components/ServerRichText.Renderer";
import { ShelfMetaLine } from "./ShelfMetadata.Presenter";

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
      <ServerRichText value={shelf.description} className="muted" />
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
