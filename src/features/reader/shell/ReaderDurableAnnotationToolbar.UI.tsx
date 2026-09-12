import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MaterialIcon } from "../../../components/MaterialIcon.UI";
import { ANNOTATION_COLOR_TOKENS } from "../annotations/ReaderAnnotationColor.Constants";
import { toAnnotationCssVars } from "../display/ReaderAnnotation.Presenter";
import { ANNOTATION_LIMITS } from "../annotations/ReaderAnnotationLimits.Policy";
import { debugWarn } from "../../../lib/debug/DebugLogger.Diagnostics";
import type {
  DurableAnnotationToolbarItem,
  DurableAnnotationToolbarPosition,
} from "./ReaderDurableAnnotationToolbar.Types";

export function DurableAnnotationToolbar({
  item,
  position,
  busy,
  theme,
  onSave,
  onDelete,
  onOpenWorkspace,
  onClose,
}: {
  item: DurableAnnotationToolbarItem;
  position: DurableAnnotationToolbarPosition;
  busy?: boolean;
  theme?: string;
  onSave: (update: { note: string; color: string }) => Promise<void>;
  onDelete: () => void;
  onOpenWorkspace: () => void;
  onClose: () => void;
}) {
  const [noteDraft, setNoteDraft] = useState(item.note ?? "");
  const [colorDraft, setColorDraft] = useState(item.color ?? "yellow");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setNoteDraft(item.note ?? "");
    setColorDraft(item.color ?? "yellow");
    setEditing(false);
    setError(null);
  }, [item.id, item.mode, item.note, item.color]);

  useEffect(() => {
    if (editing) window.requestAnimationFrame(() => noteRef.current?.focus());
  }, [editing, item.id]);

  const style = useMemo(() => ({
    left: `${position.left}px`,
    top: `${position.top}px`,
    transform: transformForPlacement(position.placement),
  }) as const, [position.left, position.placement, position.top]);

  const quote = item.quoteText?.trim() || "Highlight";
  const note = item.note?.trim() ?? "";
  const isBusy = Boolean(busy || saving);
  const vars = toAnnotationCssVars(colorDraft);

  const toolbar = (
    <div
      className="spDurableAnnotationToolbar"
      data-reader-theme={theme}
      style={{ ...style, ["--annotation-color" as any]: vars.color, ["--annotation-bg" as any]: vars.bg }}
      role="dialog"
      aria-label={item.mode === "editable" ? "Edit highlight" : "Highlight details"}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="spDurableAnnotationQuote" title={quote}>{quote}</div>

      {item.mode === "readonly" ? (
        note ? <div className="spDurableAnnotationNote">{note}</div> : null
      ) : null}

      {item.mode === "editable" && editing ? (
        <form
          className="spDurableAnnotationEdit"
          onSubmit={(event) => {
            event.preventDefault();
            if (isBusy) return;
            setSaving(true);
            setError(null);
            void (async () => {
              try {
                await onSave({ note: noteDraft, color: colorDraft });
                onClose();
              } catch (err) {
                debugWarn("reader", "highlight update did not complete", {
                  annotationId: item.id,
                  error: err,
                });
                setError("Couldn't update the highlight. Try again.");
              } finally {
                setSaving(false);
              }
            })();
          }}
        >
          <textarea
            ref={noteRef}
            className="input spDurableAnnotationTextarea"
            rows={3}
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.currentTarget.value)}
            placeholder="Add a note"
            maxLength={ANNOTATION_LIMITS.bodyValueMaxChars}
            disabled={isBusy}
          />

          <div className="spAnnotationColorSwatches" role="radiogroup" aria-label="Highlight color">
            {ANNOTATION_COLOR_TOKENS.map((token) => (
              <button
                key={token}
                type="button"
                className={`spAnnotationSwatch ${colorDraft === token ? "spAnnotationSwatchActive" : ""}`}
                onClick={() => setColorDraft(token)}
                aria-label={`${token.charAt(0).toUpperCase()}${token.slice(1)}`}
                role="radio"
                aria-checked={colorDraft === token}
                title={token}
                disabled={isBusy}
                style={{ ["--swatch-color" as any]: toAnnotationCssVars(token).color }}
              />
            ))}
          </div>

          {error ? <div className="spAnnotationEditError" role="alert">{error}</div> : null}

          <div className="spDurableAnnotationActions">
            <button type="submit" className="button buttonCompact spIconButton spIconButtonTight" title="Save changes" aria-label="Save highlight changes" disabled={isBusy}>
              <MaterialIcon name="check" />
            </button>
            <button
              type="button"
              className="button buttonCompact spIconButton spIconButtonTight"
              title="Cancel editing"
              aria-label="Cancel editing"
              onClick={() => {
                setNoteDraft(item.note ?? "");
                setColorDraft(item.color ?? "yellow");
                setEditing(false);
                setError(null);
              }}
              disabled={isBusy}
            >
              <MaterialIcon name="close" />
            </button>
            <button type="button" className="button buttonCompact spIconButton spIconButtonTight" title="Open in Annotations" aria-label="Open in Annotations" onClick={onOpenWorkspace} disabled={isBusy}>
              <MaterialIcon name="open_in_new" />
            </button>
            <button
              type="button"
              className="button buttonDanger buttonCompact spIconButton spIconButtonTight spDurableAnnotationDeleteButton"
              title="Delete highlight"
              aria-label="Delete highlight"
              onClick={onDelete}
              disabled={isBusy}
            >
              <MaterialIcon name="delete" />
            </button>
            <button type="button" className="button buttonCompact spIconButton spIconButtonTight" title="Close highlight details" aria-label="Close highlight details" onClick={onClose} disabled={isBusy}>
              <MaterialIcon name="close" />
            </button>
          </div>
        </form>
      ) : null}

      {item.mode === "editable" && !editing ? (
        note ? <div className="spDurableAnnotationNote">{note}</div> : null
      ) : null}

      {!editing ? (
        <div className="spDurableAnnotationActions">
          {item.mode === "editable" ? (
            <button type="button" className="button buttonCompact spIconButton spIconButtonTight" title="Edit highlight" aria-label="Edit highlight" onClick={() => setEditing(true)} disabled={isBusy}>
              <MaterialIcon name="edit_note" />
            </button>
          ) : null}
          <button type="button" className="button buttonCompact spIconButton spIconButtonTight" title="Open in Annotations" aria-label="Open in Annotations" onClick={onOpenWorkspace} disabled={isBusy}>
            <MaterialIcon name="open_in_new" />
          </button>
          {item.mode === "editable" ? (
            <button
              type="button"
              className="button buttonDanger buttonCompact spIconButton spIconButtonTight spDurableAnnotationDeleteButton"
              title="Delete highlight"
              aria-label="Delete highlight"
              onClick={onDelete}
              disabled={isBusy}
            >
              <MaterialIcon name="delete" />
            </button>
          ) : null}
          <button type="button" className="button buttonCompact spIconButton spIconButtonTight" title="Close highlight details" aria-label="Close highlight details" onClick={onClose} disabled={isBusy}>
            <MaterialIcon name="close" />
          </button>
        </div>
      ) : null}
    </div>
  );

  return createPortal(toolbar, document.body);
}

function transformForPlacement(placement: DurableAnnotationToolbarPosition["placement"]): string {
  switch (placement) {
    case "left":
      return "translate(-100%, -50%)";
    case "right":
      return "translate(0, -50%)";
    case "above":
      return "translate(-50%, -100%)";
    case "below":
      return "translate(-50%, 0)";
  }
}
