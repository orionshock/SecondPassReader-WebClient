import { useEffect, useMemo, useRef } from "react";
import { MaterialIcon } from "../../../components/MaterialIcon.UI";
import { ANNOTATION_COLOR_TOKENS } from "../annotations/ReaderAnnotationColor.Constants";
import { toAnnotationCssVars } from "../display/ReaderAnnotation.Presenter";

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
  onToggleNote: () => void;
  onChangeNoteDraft: (value: string) => void;
  onCancel: () => void;
  onSizeChange?: (size: { width: number; height: number }) => void;
};

export function SelectionHighlightToolbar(props: SelectionHighlightToolbarProps) {
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const lastSizeRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    if (!props.open || !props.noteOpen) return;
    noteRef.current?.focus?.();
  }, [props.noteOpen, props.open]);

  useEffect(() => {
    if (!props.open || !props.onSizeChange) return;
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const reportSize = () => {
      const rect = toolbar.getBoundingClientRect();
      const next = { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
      if (next.width === lastSizeRef.current.width && next.height === lastSizeRef.current.height) return;
      lastSizeRef.current = next;
      props.onSizeChange?.(next);
    };
    reportSize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(reportSize);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, [props.onSizeChange, props.open]);

  const style = useMemo(() => {
    return {
      left: `${props.left}px`,
      top: `${props.top}px`,
      transform: props.placement === "above" ? "translate(-50%, calc(-100% - 10px))" : "translate(-50%, 10px)",
    } as const;
  }, [props.left, props.placement, props.top]);

  if (!props.open) return null;

  return (
    <div ref={toolbarRef} className="spSelectionToolbar" style={style} role="toolbar" aria-label="Highlight selection">
      <div className="spSelectionToolbarRow">
        <div className="spSelectionToolbarChips" role="group" aria-label="Highlight color">
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
                aria-pressed={active}
                title={`Highlight ${token}`}
                disabled={Boolean(props.busy)}
                style={{ ["--swatch-color" as any]: vars.color }}
              />
            );
          })}
        </div>

        <button
          type="button"
          className="button buttonCompact spIconButton spIconButtonTight"
          onClick={props.onToggleNote}
          aria-label={props.noteOpen ? "Hide note" : "Add note"}
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
      </div>

      {props.noteOpen ? (
        <div className="spSelectionToolbarNote">
          <textarea
            ref={noteRef}
            className="input spSelectionToolbarTextarea"
            rows={2}
            value={props.noteDraft}
            onChange={(e) => props.onChangeNoteDraft(e.currentTarget.value)}
            placeholder="Add a note"
            disabled={Boolean(props.busy)}
          />
        </div>
      ) : null}
    </div>
  );
}
