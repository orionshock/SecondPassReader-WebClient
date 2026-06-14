import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MaterialIcon } from "../../../components/MaterialIcon";
import { ANNOTATION_COLOR_TOKENS, toAnnotationCssVars } from "../annotations/annotationColors";
import { ANNOTATION_LIMITS } from "../annotations/annotationLimits";

export type DurableAnnotationToolbarItem = {
  id: string;
  mode: "editable" | "readonly";
  quoteText?: string;
  note?: string;
  color?: string;
};

export type DurableAnnotationToolbarPosition = {
  left: number;
  top: number;
  placement: "above" | "below" | "left" | "right";
};

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
      aria-label={item.mode === "editable" ? "Edit highlight" : "Annotation details"}
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
                setError(err instanceof Error ? err.message : "Failed to update highlight.");
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
            placeholder="Highlight Note"
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
                aria-label={`Color ${token}`}
                title={token}
                disabled={isBusy}
                style={{ ["--swatch-color" as any]: toAnnotationCssVars(token).color }}
              />
            ))}
          </div>

          {error ? <div className="spAnnotationEditError" role="alert">{error}</div> : null}

          <div className="spDurableAnnotationActions">
            <button type="submit" className="button buttonPrimary buttonCompact spIconButton spIconButtonTight" title="Save changes" aria-label="Save highlight changes" disabled={isBusy}>
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
            <button type="button" className="button buttonCompact spIconButton spIconButtonTight" title="Open in annotation workspace" aria-label="Open in annotation workspace" onClick={onOpenWorkspace} disabled={isBusy}>
              <MaterialIcon name="open_in_new" />
            </button>
            <button
              type="button"
              className="button buttonDanger buttonCompact spIconButton spIconButtonTight spDurableAnnotationDeleteButton"
              title="Delete annotation"
              aria-label="Delete annotation"
              onClick={onDelete}
              disabled={isBusy}
            >
              <MaterialIcon name="delete" />
            </button>
            <button type="button" className="button buttonCompact spIconButton spIconButtonTight" title="Close annotation toolbar" aria-label="Close annotation toolbar" onClick={onClose} disabled={isBusy}>
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
            <button type="button" className="button buttonCompact spIconButton spIconButtonTight" title="Edit note and color" aria-label="Edit note and color" onClick={() => setEditing(true)} disabled={isBusy}>
              <MaterialIcon name="edit_note" />
            </button>
          ) : null}
          <button type="button" className="button buttonCompact spIconButton spIconButtonTight" title="Open in annotation workspace" aria-label="Open in annotation workspace" onClick={onOpenWorkspace} disabled={isBusy}>
            <MaterialIcon name="open_in_new" />
          </button>
          {item.mode === "editable" ? (
            <button
              type="button"
              className="button buttonDanger buttonCompact spIconButton spIconButtonTight spDurableAnnotationDeleteButton"
              title="Delete annotation"
              aria-label="Delete annotation"
              onClick={onDelete}
              disabled={isBusy}
            >
              <MaterialIcon name="delete" />
            </button>
          ) : null}
          <button type="button" className="button buttonCompact spIconButton spIconButtonTight" title="Close annotation toolbar" aria-label="Close annotation toolbar" onClick={onClose} disabled={isBusy}>
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
