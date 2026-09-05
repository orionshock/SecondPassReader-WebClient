import { MaterialIcon } from "../../components/Material.Icon";
import { ShelfForm, type ShelfFormValues } from "./Shelf.Form";

export function ShelfEditInfoModal({
  values,
  busy,
  descriptionError,
  onChange,
  onSave,
  onCancel,
}: {
  values: ShelfFormValues;
  busy: boolean;
  descriptionError?: string | null;
  onChange: (values: ShelfFormValues) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="modalOverlay shelfModalOverlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <section className="modalPanel shelfModalPanel" role="dialog" aria-modal="true" aria-labelledby="shelf-info-title">
        <div className="modalHeaderRow">
          <div className="modalTitle" id="shelf-info-title">
            Change shelf info
          </div>
          <button
            type="button"
            className="button buttonCompact shelfIconButton"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
            title="Close"
          >
            <MaterialIcon name="close" />
          </button>
        </div>
        <div className="modalBody">
          <ShelfForm
            values={values}
            onChange={onChange}
            onSubmit={onSave}
            onCancel={onCancel}
            submitLabel="Save shelf"
            busy={busy}
            descriptionError={descriptionError}
          />
        </div>
      </section>
    </div>
  );
}
