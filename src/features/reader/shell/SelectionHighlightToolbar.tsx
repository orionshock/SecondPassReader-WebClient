import { useEffect, useMemo, useRef } from "react";
import { MaterialIcon } from "../../../components/MaterialIcon";
import { ANNOTATION_COLOR_TOKENS } from "../annotations/annotationColors";
import { toAnnotationCssVars } from "../annotations/annotationColors";

export type SelectionHighlightToolbarProps = {
  open: boolean;
  left: number;
  top: number;
  placement: "above" | "below";
  color: string;
  noteOpen: boolean;
  noteDraft: string;
  busy?: boolean;
  onPickColorAndCommit: (color: string) => void;
  onOpenNote: () => void;
  onChangeNoteDraft: (value: string) => void;
  onSaveNote: () => void;
  onCloseNote: () => void;
  onCancel: () => void;
};

export function SelectionHighlightToolbar(props: SelectionHighlightToolbarProps) {
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!props.open || !props.noteOpen) return;
    noteRef.current?.focus?.();
  }, [props.noteOpen, props.open]);

  const style = useMemo(() => {
    return {
      left: `${props.left}px`,
      top: `${props.top}px`,
      transform: props.placement === "above" ? "translate(-50%, calc(-100% - 10px))" : "translate(-50%, 10px)",
    } as const;
  }, [props.left, props.placement, props.top]);

  if (!props.open) return null;

  return (
    <div className="spSelectionToolbar" style={style} role="dialog" aria-label="Highlight selection">
      <div className="spSelectionToolbarRow">
        <div className="spSelectionToolbarChips" aria-label="Highlight color">
          {ANNOTATION_COLOR_TOKENS.map((token) => {
            const vars = toAnnotationCssVars(token);
            const active = props.color === token;
            return (
              <button
                key={token}
                type="button"
                className={`spAnnotationSwatch ${active ? "spAnnotationSwatchActive" : ""}`}
                onClick={() => props.onPickColorAndCommit(token)}
                aria-label={`Highlight ${token}`}
                title={`Highlight ${token}`}
                disabled={Boolean(props.busy)}
                style={{ ["--swatch-color" as any]: vars.color }}
              />
            );
          })}
        </div>

        {!props.noteOpen ? (
          <>
            <button
              type="button"
              className="button buttonCompact spIconButton spIconButtonTight"
              onClick={props.onOpenNote}
              aria-label="Add note"
              title="Note"
              disabled={Boolean(props.busy)}
            >
              <MaterialIcon name="edit_note" />
            </button>
            <button
              type="button"
              className="button buttonCompact spIconButton spIconButtonTight"
              onClick={props.onCancel}
              aria-label="Cancel"
              title="Cancel"
              disabled={Boolean(props.busy)}
            >
              <MaterialIcon name="close" />
            </button>
          </>
        ) : null}
      </div>

      {props.noteOpen ? (
        <div className="spSelectionToolbarNote">
          <textarea
            ref={noteRef}
            className="input spSelectionToolbarTextarea"
            rows={2}
            value={props.noteDraft}
            onChange={(e) => props.onChangeNoteDraft(e.currentTarget.value)}
            placeholder="Highlight Note"
            disabled={Boolean(props.busy)}
          />
          <div className="spSelectionToolbarRow spSelectionToolbarRowActions">
            <button
              type="button"
              className="button buttonCompact spIconButton spIconButtonTight"
              onClick={props.onSaveNote}
              aria-label="Save highlight with note"
              title="Save"
              disabled={Boolean(props.busy) || !props.noteDraft.trim()}
            >
              <MaterialIcon name="check" />
            </button>
            <button
              type="button"
              className="button buttonCompact spIconButton spIconButtonTight"
              onClick={props.onCloseNote}
              aria-label="Close note editor"
              title="Close"
              disabled={Boolean(props.busy)}
            >
              <MaterialIcon name="close" />
            </button>
            <button
              type="button"
              className="button buttonCompact spIconButton spIconButtonTight"
              onClick={props.onCancel}
              aria-label="Cancel"
              title="Cancel"
              disabled={Boolean(props.busy)}
            >
              <MaterialIcon name="close" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
