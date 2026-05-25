import { DEFAULT_HIGHLIGHT_COLOR, HIGHLIGHT_COLORS, highlightColorLabel, highlightColorToClassName, type HighlightColor } from "./highlightColors";

export function SelectionToolbar({
  previewText,
  color,
  noteOpen,
  noteDraft,
  onChangeColor,
  onHighlight,
  onOpenNote,
  onChangeNoteDraft,
  onSaveNote,
  onCancel,
}: {
  previewText: string;
  color: HighlightColor;
  noteOpen: boolean;
  noteDraft: string;
  onChangeColor: (next: HighlightColor) => void;
  onHighlight: (color: HighlightColor) => void;
  onOpenNote: () => void;
  onChangeNoteDraft: (next: string) => void;
  onSaveNote: (color: HighlightColor) => void;
  onCancel: () => void;
}) {
  const effectiveColor = color ?? DEFAULT_HIGHLIGHT_COLOR;

  return (
    <div className="selectionToolbar" role="region" aria-label="Selection toolbar">
      {!noteOpen ? (
        <>
          <div className="selectionToolbarRow">
            <div className="selectionSwatches" role="group" aria-label="Highlight color">
              {HIGHLIGHT_COLORS.map((c) => {
                const label = highlightColorLabel(c);
                const isActive = c === effectiveColor;
                return (
                  <button
                    key={c}
                    type="button"
                    className={`selectionSwatch ${highlightColorToClassName(c)} ${isActive ? "selectionSwatchActive" : ""}`}
                    onClick={() => onHighlight(c)}
                    aria-label={`Highlight ${label.toLowerCase()}`}
                    title={`Highlight ${label.toLowerCase()}`}
                  />
                );
              })}
            </div>

            <button
              type="button"
              className="button buttonCompact selectionIconButton"
              onClick={onOpenNote}
              aria-label="Add note"
              title="Add note"
            >
              {"\u270E"}
            </button>

            <button
              type="button"
              className="button buttonCompact selectionIconButton"
              onClick={onCancel}
              aria-label="Cancel selection"
              title="Cancel selection"
            >
              {"\u00D7"}
            </button>
          </div>

          {previewText ? <div className="selectionPreview mono">{previewText}</div> : null}
        </>
      ) : (
        <>
          <div className="selectionToolbarRow">
            <div className="selectionSwatches" role="group" aria-label="Highlight color">
              {HIGHLIGHT_COLORS.map((c) => {
                const label = highlightColorLabel(c);
                const isActive = c === effectiveColor;
                return (
                  <button
                    key={c}
                    type="button"
                    className={`selectionSwatch ${highlightColorToClassName(c)} ${isActive ? "selectionSwatchActive" : ""}`}
                    onClick={() => onChangeColor(c)}
                    aria-label={`Set highlight color ${label.toLowerCase()}`}
                    title={`Set highlight color ${label.toLowerCase()}`}
                  />
                );
              })}
            </div>

            <button
              type="button"
              className="button buttonPrimary buttonCompact"
              onClick={() => onSaveNote(effectiveColor)}
              aria-label="Save note"
              title="Save note"
            >
              Save note
            </button>

            <button
              type="button"
              className="button buttonCompact"
              onClick={onCancel}
              aria-label="Cancel selection"
              title="Cancel selection"
            >
              Cancel
            </button>
          </div>

          {previewText ? <div className="selectionPreview mono">{previewText}</div> : null}

          <textarea
            className="input selectionNoteInput"
            rows={3}
            value={noteDraft}
            onChange={(e) => onChangeNoteDraft(e.target.value)}
            aria-label="Note text"
            placeholder={`Note${"\u2026"}`}
          />
        </>
      )}
    </div>
  );
}

