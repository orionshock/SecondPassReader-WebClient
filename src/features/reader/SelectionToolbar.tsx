import { HIGHLIGHT_COLORS, highlightColorLabel, highlightColorToClassName, type HighlightColor } from "./highlightColors";

export function SelectionToolbar({
  noteOpen,
  noteDraft,
  onHighlight,
  onOpenNote,
  onChangeNoteDraft,
  onSaveNote,
  onCancel,
}: {
  noteOpen: boolean;
  noteDraft: string;
  onHighlight: (color: HighlightColor) => void;
  onOpenNote: () => void;
  onChangeNoteDraft: (next: string) => void;
  onSaveNote: (color: HighlightColor) => void;
  onCancel: () => void;
}) {
  return (
    <div className="selectionToolbar" role="region" aria-label="Selection toolbar">
      {!noteOpen ? (
        <>
          <div className="selectionToolbarRow">
            <div className="selectionSwatches" role="group" aria-label="Highlight color">
              {HIGHLIGHT_COLORS.map((c) => {
                const label = highlightColorLabel(c);
                return (
                  <button
                    key={c}
                    type="button"
                    className={`selectionSwatch ${highlightColorToClassName(c)}`}
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
        </>
      ) : (
        <>
          <div className="selectionToolbarRow">
            <div className="selectionSwatches" role="group" aria-label="Highlight color">
              {HIGHLIGHT_COLORS.map((c) => {
                const label = highlightColorLabel(c);
                return (
                  <button
                    key={c}
                    type="button"
                    className={`selectionSwatch ${highlightColorToClassName(c)}`}
                    onClick={() => onSaveNote(c)}
                    aria-label={`Save note with ${label.toLowerCase()} highlight`}
                    title={`Save note with ${label.toLowerCase()} highlight`}
                  />
                );
              })}
            </div>

            <button
              type="button"
              className="button buttonCompact"
              onClick={onCancel}
              aria-label="Cancel selection"
              title="Cancel selection"
            >
              {"\u00D7"}
            </button>
          </div>

          <textarea
            className="input selectionNoteInput"
            rows={3}
            value={noteDraft}
            onChange={(e) => onChangeNoteDraft(e.target.value)}
            aria-label="Annotation note"
            placeholder={`Note${"\u2026"}`}
          />
        </>
      )}
    </div>
  );
}
