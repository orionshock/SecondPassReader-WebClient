import type { FormEventHandler } from "react";
import { MaterialIcon } from "../../../components/MaterialIcon.UI";
import { InlineMeta } from "../../../components/Metadata.UI";
import {
  ANNOTATION_COLOR_TOKENS,
  toAnnotationCssVars,
} from "../display/ReaderAnnotation.Presenter";
import { ANNOTATION_LIMITS } from "./ReaderAnnotationLimits.Policy";

export function CurrentAnnotationCardHighlightEditor({
  annotationId,
  canSave,
  descriptionStatus,
  draftColor,
  draftNote,
  editError,
  editStatus,
  label,
  locationMetaParts,
  when,
  onCancel,
  onColorChange,
  onNoteChange,
  onSubmit,
}: {
  annotationId: string;
  canSave: boolean;
  descriptionStatus: "idle" | "loading" | "ready" | "error";
  draftColor: string;
  draftNote: string;
  editError: string | null;
  editStatus: "idle" | "saving" | "error";
  label: string;
  locationMetaParts: string[];
  when: string | null;
  onCancel: () => void;
  onColorChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}) {
  return (
    <form className="spAnnotationEditForm" onSubmit={onSubmit}>
      <div className="spAnnotationEditRow">
        <textarea
          id={`note-${annotationId}`}
          className="input spAnnotationEditTextarea"
          rows={3}
          value={draftNote}
          onChange={(event) => onNoteChange(event.currentTarget.value)}
          placeholder="Highlight Note"
          maxLength={ANNOTATION_LIMITS.bodyValueMaxChars}
          disabled={editStatus === "saving"}
        />
      </div>

      {editStatus === "error" && editError ? (
        <div className="spAnnotationEditError" role="alert">
          {editError}
        </div>
      ) : null}

      <div className="spAnnotationEditActions">
        <div className="spAnnotationColorSwatches" role="radiogroup" aria-label="Highlight color">
          {ANNOTATION_COLOR_TOKENS.map((token) => (
            <button
              key={token}
              type="button"
              className={`spAnnotationSwatch ${draftColor === token ? "spAnnotationSwatchActive" : ""}`}
              onClick={() => onColorChange(token)}
              aria-label={`Color ${token}`}
              role="radio"
              aria-checked={draftColor === token}
              title={token}
              disabled={editStatus === "saving"}
              style={{ ["--swatch-color" as any]: toAnnotationCssVars(token).color }}
            />
          ))}
        </div>

        <div className="spAnnotationEditPrimaryActions">
          <button
            type="submit"
            className="button buttonCompact spIconButton spIconButtonTight"
            aria-label="Save highlight"
            title="Save"
            disabled={!canSave}
          >
            <MaterialIcon name="check" />
          </button>
          <button
            type="button"
            className="button buttonCompact spIconButton spIconButtonTight"
            aria-label="Cancel edit"
            title="Cancel"
            onClick={onCancel}
            disabled={editStatus === "saving"}
          >
            <MaterialIcon name="close" />
          </button>
        </div>

        {locationMetaParts.length > 0 || when || descriptionStatus === "loading" ? (
          <div className="muted spAnnotationActionMeta" title={label}>
            <InlineMeta items={[...locationMetaParts, when]} />
            {descriptionStatus === "loading" ? <span className="muted">{` ${"\u2026"}`}</span> : null}
          </div>
        ) : null}
      </div>
    </form>
  );
}
