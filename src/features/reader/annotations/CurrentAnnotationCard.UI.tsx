import { MaterialIcon } from "../../../components/MaterialIcon.UI";
import {
  getHighlightAnnotationDisplay,
  toAnnotationCssVars,
} from "../display/ReaderAnnotation.Presenter";
import { CurrentAnnotationCardBookmarkView } from "./CurrentAnnotationCardBookmarkView.UI";
import { CurrentAnnotationCardHighlightEditor } from "./CurrentAnnotationCardHighlightEditor.UI";
import { CurrentAnnotationCardHighlightView } from "./CurrentAnnotationCardHighlightView.UI";
import type { CurrentSessionAnnotationViewModel, HighlightViewModel } from "./ReaderAnnotationViewModels.Types";
import { debugWarn } from "../../../lib/debug/DebugLogger.Diagnostics";

function normalizeQuoteTextForDisplay(text: string): string {
  // Selections and describing bodies can contain hard line separators and trailing whitespace.
  // For card display, normalize to a single-line flow so we don't render what looks like a
  // "blank line" at the end of the quote block.
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
  draftColor,
  draftNote,
  editingId,
  editError,
  editStatus,
  onJumpToCfi,
  onJumpToCfiRange,
  onRemoveAnnotation,
  onUpdateHighlight,
  setDraftColor,
  setDraftNote,
  setEditingId,
  setEditError,
  setEditStatus,
}: {
  annotation: CurrentSessionAnnotationViewModel;
  busy: boolean;
  readOnly?: boolean;
  currentCfi?: string | null;
  draftColor: string;
  draftNote: string;
  editingId: string | null;
  editError: string | null;
  editStatus: "idle" | "saving" | "error";
  onJumpToCfi: (cfi: string) => void;
  onJumpToCfiRange: (cfiRange: string) => void;
  onRemoveAnnotation: (annotationId: string) => void;
  onUpdateHighlight: (annotationId: string, update: { note: string; color: string }) => Promise<void>;
  setDraftColor: (value: string) => void;
  setDraftNote: (value: string) => void;
  setEditingId: (value: string | null) => void;
  setEditError: (value: string | null) => void;
  setEditStatus: (value: "idle" | "saving" | "error") => void;
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
  const isEditing = editingId === h.id;
  const canSave = editStatus !== "saving" && !busy;
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
            draftColor={draftColor}
            draftNote={draftNote}
            editError={editError}
            editStatus={editStatus}
            label={h.label}
            locationMetaParts={locationMetaParts}
            when={when}
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSave) return;
              setEditStatus("saving");
              setEditError(null);
              void (async () => {
                try {
                  await onUpdateHighlight(h.id, { note: draftNote, color: draftColor });
                  setEditStatus("idle");
                  setEditingId(null);
                } catch (err) {
                  debugWarn("reader", "highlight update did not complete", {
                    annotationId: h.id,
                    error: err,
                  });
                  setEditStatus("error");
                  setEditError("Couldn't update the highlight. Try again.");
                }
              })();
            }}
            onCancel={() => {
              setEditingId(null);
              setEditStatus("idle");
              setEditError(null);
            }}
            onColorChange={setDraftColor}
            onNoteChange={setDraftNote}
          />
        ) : null}
      </div>

      <div className="spAnnotationRightRail" aria-label="Highlight actions">
        {!readOnly && !isEditing ? (
          <button
            type="button"
            className="button buttonCompact spIconButton"
            onClick={() => {
              setEditingId(h.id);
              setDraftNote(h.note ?? "");
              setDraftColor(h.color ?? "yellow");
              setEditStatus("idle");
              setEditError(null);
            }}
            aria-label="Edit highlight"
            title="Edit highlight"
            disabled={editStatus === "saving"}
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
          disabled={editStatus === "saving"}
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
            disabled={editStatus === "saving"}
          >
            <MaterialIcon name="delete" />
          </button>
        ) : null}
      </div>
    </article>
  );
}
