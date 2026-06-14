import { useEffect, useMemo, useRef, useState } from "react";
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
  placement: "above" | "below";
};

export function DurableAnnotationToolbar({
  item,
  position,
  busy,
  onSave,
  onDelete,
  onOpenWorkspace,
  onClose,
}: {
  item: DurableAnnotationToolbarItem;
  position: DurableAnnotationToolbarPosition;
  busy?: boolean;
  onSave: (update: { note: string; color: string }) => Promise<void>;
  onDelete: () => void;
  onOpenWorkspace: () => void;
  onClose: () => void;
}) {
  const [noteDraft, setNoteDraft] = useState(item.note ?? "");
  const [colorDraft, setColorDraft] = useState(item.color ?? "yellow");
  const [editing, setEditing] = useState(item.mode === "editable");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setNoteDraft(item.note ?? "");
    setColorDraft(item.color ?? "yellow");
    setEditing(item.mode === "editable");
    setError(null);
  }, [item.id, item.mode, item.note, item.color]);

  useEffect(() => {
    if (editing) window.requestAnimationFrame(() => noteRef.current?.focus());
  }, [editing, item.id]);

  const style = useMemo(() => ({
    left: `${position.left}px`,
    top: `${position.top}px`,
    transform: position.placement === "above" ? "translate(-50%, calc(-100% - 10px))" : "translate(-50%, 10px)",
  }) as const, [position.left, position.placement, position.top]);

  const quote = item.quoteText?.trim() || "Highlight";
  const note = item.note?.trim() ?? "";
  const isBusy = Boolean(busy || saving);
  const vars = toAnnotationCssVars(colorDraft);

  return (
    <div
      className="spDurableAnnotationToolbar"
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
            <button type="submit" className="button buttonCompact spIconButton spIconButtonTight" title="Save" aria-label="Save highlight" disabled={isBusy}>
              <MaterialIcon name="check" />
            </button>
            <button type="button" className="button buttonCompact spIconButton spIconButtonTight" title="Cancel" aria-label="Cancel" onClick={onClose} disabled={isBusy}>
              <MaterialIcon name="close" />
            </button>
          </div>
        </form>
      ) : null}

      {item.mode === "editable" && !editing ? (
        note ? <div className="spDurableAnnotationNote">{note}</div> : null
      ) : null}

      <div className="spDurableAnnotationActions">
        {item.mode === "editable" && !editing ? (
          <button type="button" className="button buttonCompact spIconButton spIconButtonTight" title="Edit note" aria-label="Edit note" onClick={() => setEditing(true)} disabled={isBusy}>
            <MaterialIcon name="edit_note" />
          </button>
        ) : null}
        <button type="button" className="button buttonCompact spIconButton spIconButtonTight" title="Open in workspace" aria-label="Open in workspace" onClick={onOpenWorkspace} disabled={isBusy}>
          <MaterialIcon name="open_in_new" />
        </button>
        {item.mode === "editable" ? (
          <button
            type="button"
            className="button buttonCompact spIconButton spIconButtonTight"
            title="Delete"
            aria-label="Delete annotation"
            onClick={onDelete}
            disabled={isBusy}
          >
            <MaterialIcon name="delete" />
          </button>
        ) : null}
        <button type="button" className="button buttonCompact spIconButton spIconButtonTight" title="Close" aria-label="Close" onClick={onClose} disabled={isBusy}>
          <MaterialIcon name="close" />
        </button>
      </div>
    </div>
  );
}
