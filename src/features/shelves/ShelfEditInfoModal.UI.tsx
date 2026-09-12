import { useRef } from "react";
import { MaterialIcon } from "../../components/MaterialIcon.UI";
import { useModalDialogFocus } from "../../components/ModalDialogFocus.Lifecycle";
import { ShelfForm, type ShelfFormValues } from "./ShelfForm.UI";

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
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  useModalDialogFocus({ active: true, dialogRef, initialFocusRef: closeButtonRef, onDismiss: onCancel, dismissDisabled: busy });

  return (
    <div
      className="modalOverlay shelfModalOverlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <section ref={dialogRef} className="modalPanel shelfModalPanel" role="dialog" aria-modal="true" aria-labelledby="shelf-info-title" tabIndex={-1}>
        <div className="modalHeaderRow">
          <div className="modalTitle" id="shelf-info-title">
            Change shelf info
          </div>
          <button
            ref={closeButtonRef}
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
