import { MaterialIcon } from "../../../components/MaterialIcon.UI";
import {
  getHighlightAnnotationDisplay,
  toAnnotationCssVars,
} from "../display/ReaderAnnotation.Presenter";
import { CurrentAnnotationCardBookmarkView } from "./CurrentAnnotationCardBookmarkView.UI";
import { CurrentAnnotationCardHighlightEditor } from "./CurrentAnnotationCardHighlightEditor.UI";
import { CurrentAnnotationCardHighlightView } from "./CurrentAnnotationCardHighlightView.UI";
import type { CurrentSessionAnnotationViewModel, HighlightViewModel } from "./ReaderAnnotationViewModels.Types";
import type { CurrentAnnotationEditingState } from "./CurrentAnnotationEditing.Controller";

function normalizeQuoteTextForDisplay(text: string): string {
  // Preserve stored text; normalize whitespace only for the single-line card preview.
  return text.replace(/\s+/g, " ").trim();
}

function formatWhen(ts: string | undefined): string | null {
  const s = typeof ts === "string" ? ts.trim() : "";
  if (!s) return null;
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return s;
  return new Date(ms).toLocaleString();
}

function toLocationMetaParts(parts: string[] | undefined): string[] {
  return (parts ?? []).filter((part) => part !== "Saved location");
}

export function CurrentAnnotationCard({
  annotation,
  busy,
  readOnly = false,
  currentCfi,
  editing,
  onJumpToCfi,
  onJumpToCfiRange,
  onRemoveAnnotation,
  onBeginEdit,
  onCancelEdit,
  onChangeDraftColor,
  onChangeDraftNote,
  onSaveEdit,
}: {
  annotation: CurrentSessionAnnotationViewModel;
  busy: boolean;
  readOnly?: boolean;
  currentCfi?: string | null;
  editing: CurrentAnnotationEditingState | null;
  onJumpToCfi: (cfi: string) => void;
  onJumpToCfiRange: (cfiRange: string) => void;
  onRemoveAnnotation: (annotationId: string) => void;
  onBeginEdit: (annotation: { clientId: string; annotationId: string; note?: string; color?: string }) => void;
  onCancelEdit: () => void;
  onChangeDraftColor: (value: string) => void;
  onChangeDraftNote: (value: string) => void;
  onSaveEdit: () => Promise<void>;
}) {
  if ("cfi" in annotation) {
    const b = annotation;
    const isCurrent = b.isCurrent || Boolean(currentCfi && b.cfi === currentCfi);
    const when = formatWhen(b.timestamp);
    const locationMetaParts = toLocationMetaParts(b.labelParts);

    return (
      <CurrentAnnotationCardBookmarkView
        bookmark={b}
        isCurrent={isCurrent}
        locationMetaParts={locationMetaParts}
        when={when}
        readOnly={readOnly}
        onJump={() => onJumpToCfi(b.cfi)}
        onDelete={() => {
          if (!window.confirm("Delete this bookmark?")) return;
          onRemoveAnnotation(b.id);
        }}
      />
    );
  }

  const h = annotation as HighlightViewModel;
  const vars = toAnnotationCssVars(h.color);
  const quoteText = h.text ? normalizeQuoteTextForDisplay(h.text) : "";
  const when = formatWhen(h.timestamp);
  const locationMetaParts = toLocationMetaParts(h.labelParts);
  const activeEditing = editing?.clientId === h.clientId ? editing : null;
  const isEditing = Boolean(activeEditing);
  const canSave = activeEditing?.status !== "saving" && !busy;
  const display = getHighlightAnnotationDisplay(h.note);
  return (
    <article
      key={h.id}
      tabIndex={-1}
      data-annotation-id={h.id}
      className="spAnnotationCard"
      style={{ ["--annotation-color" as any]: vars.color, ["--annotation-bg" as any]: vars.bg }}
    >
      <div className="spAnnotationLeftRail" aria-hidden="true">
        <span className="spAnnotationTypeIcon" title={display.label}>
          <MaterialIcon name={display.iconName} />
        </span>
      </div>

      <div className="spAnnotationBody">
        <CurrentAnnotationCardHighlightView
          descriptionStatus={h.descriptionStatus}
          isEditing={isEditing}
          label={h.label}
          locationMetaParts={locationMetaParts}
          note={h.note}
          quoteText={quoteText}
          when={when}
        />

        {isEditing ? (
          <CurrentAnnotationCardHighlightEditor
            annotationId={h.id}
            canSave={canSave}
            descriptionStatus={h.descriptionStatus}
            draftColor={activeEditing!.draftColor}
            draftNote={activeEditing!.draftNote}
            editError={activeEditing!.error}
            editStatus={activeEditing!.status}
            label={h.label}
            locationMetaParts={locationMetaParts}
            when={when}
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSave) return;
              void onSaveEdit();
            }}
            onCancel={onCancelEdit}
            onColorChange={onChangeDraftColor}
            onNoteChange={onChangeDraftNote}
          />
        ) : null}
      </div>

      <div className="spAnnotationRightRail" aria-label="Highlight actions">
        {!readOnly && !isEditing ? (
          <button
            type="button"
            className="button buttonCompact spIconButton"
            onClick={() => {
              onBeginEdit({
                clientId: h.clientId,
                annotationId: h.id,
                note: h.note,
                color: h.color,
              });
            }}
            aria-label="Edit highlight"
            title="Edit highlight"
            disabled={editing?.status === "saving"}
          >
            <MaterialIcon name="edit_note" />
          </button>
        ) : null}
        <button
          type="button"
          className="button buttonCompact spIconButton"
          onClick={() => onJumpToCfiRange(h.cfiRange)}
          aria-label="Go to highlight"
          title="Go to highlight"
          disabled={editing?.status === "saving"}
        >
          <MaterialIcon name="my_location" />
        </button>
        {!readOnly ? (
          <button
            type="button"
            className="button buttonDanger buttonCompact spIconButton"
            onClick={() => {
              if (!window.confirm("Delete this highlight?")) return;
              onRemoveAnnotation(h.id);
            }}
            aria-label="Delete highlight"
            title="Delete highlight"
            disabled={editing?.status === "saving"}
          >
            <MaterialIcon name="delete" />
          </button>
        ) : null}
      </div>
    </article>
  );
}
