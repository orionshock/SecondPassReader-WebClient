import { useMemo, useState } from "react";
import type { ReadingSessionState } from "../session/types";
import { ANNOTATION_COLOR_TOKENS, toAnnotationCssVars } from "./annotationColors";
import type { HighlightViewModel, CurrentSessionAnnotationViewModel } from "./viewModels";
import { ANNOTATION_LIMITS } from "./annotationLimits";
import { MaterialIcon } from "../../../components/MaterialIcon";

type TabKey = "current" | "previous";

function normalizeQuoteTextForDisplay(text: string): string {
  // Selections and describing bodies can contain hard line separators and trailing whitespace.
  // For card display, normalize to a single-line flow so we don't render what looks like a
  // "blank line" at the end of the quote block.
  return text.replace(/\s+/g, " ").trim();
}

export function AnnotationWorkspace({
  state,
  annotations,
  status,
  error,
  busy,
  currentCfi,
  onRemoveAnnotation,
  onUpdateHighlight,
}: {
  state: ReadingSessionState;
  annotations: CurrentSessionAnnotationViewModel[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  busy: boolean;
  currentCfi?: string | null;
  onRemoveAnnotation: (annotationId: string) => void;
  onUpdateHighlight: (annotationId: string, update: { note: string; color: string }) => Promise<void>;
}) {
  const [tab, setTab] = useState<TabKey>("current");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState<string>("");
  const [draftColor, setDraftColor] = useState<string>("yellow");
  const [editStatus, setEditStatus] = useState<"idle" | "saving" | "error">("idle");
  const [editError, setEditError] = useState<string | null>(null);

  const sessionLabel = useMemo(() => {
    if (state.sessionId) return state.sessionId;
    return "(none yet)";
  }, [state.sessionId]);

  return (
    <section className="panel spAnnotationWorkspace">
      <div className="spAnnotationWorkspaceHeader">
        <h2 className="panelTitle spAnnotationWorkspaceTitle">Annotations</h2>
        <div className="spAnnotationTabs" role="tablist" aria-label="Annotation tabs">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "current"}
            className={`spAnnotationTab ${tab === "current" ? "spAnnotationTabActive" : ""}`}
            onClick={() => setTab("current")}
          >
            Current session
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "previous"}
            className={`spAnnotationTab ${tab === "previous" ? "spAnnotationTabActive" : ""}`}
            onClick={() => setTab("previous")}
          >
            Previous sessions
          </button>
        </div>
        <div className="muted spAnnotationSessionId" title={sessionLabel}>
          Session: {sessionLabel}
        </div>
      </div>

      {tab === "current" ? (
        <div role="tabpanel" className="spAnnotationTabPanel">
          {status === "loading" ? <div className="muted">Loading annotations…</div> : null}
          {status === "error" && error ? <div className="muted">Failed to load annotations: {error}</div> : null}
          {busy ? <div className="muted">Updating annotations…</div> : null}
          {annotations.length === 0 ? <div className="muted">No annotations yet.</div> : null}

          {annotations.length > 0 ? (
            <div className="spAnnotationList" aria-label="Current session annotations">
              {annotations.map((a) => {
                if ("cfi" in a) {
                  const b = a;
                  const isCurrent = b.isCurrent || Boolean(currentCfi && b.cfi === currentCfi);

                  return (
                    <article
                      key={b.id}
                      className={`spAnnotationCard spAnnotationCardBookmark ${isCurrent ? "spAnnotationCardCurrent" : ""}`}
                    >
                      <div className="spAnnotationLeftRail" aria-hidden="true">
                        <span className="spAnnotationTypeIcon" title="Bookmark">
                          <MaterialIcon name="bookmark" />
                        </span>
                      </div>

                      <div className="spAnnotationBody">
                        <div className="spAnnotationBookmarkRow" title={b.label}>
                          <span className="spAnnotationBookmarkText">
                            {`Bookmark · ${b.label}`}
                            {b.descriptionStatus === "loading" ? <span className="muted">{` ${"\u2026"}`}</span> : null}
                          </span>
                          {isCurrent ? <span className="spAnnotationBadge">Current</span> : null}
                        </div>
                      </div>

                      <div className="spAnnotationRightRail" aria-label="Bookmark actions">
                        <button
                          type="button"
                          className="button buttonCompact spIconButton"
                          onClick={() => {
                            if (!window.confirm("Delete this bookmark?")) return;
                            onRemoveAnnotation(b.id);
                          }}
                          aria-label="Remove bookmark"
                          title="Remove"
                        >
                          <MaterialIcon name="delete" />
                        </button>
                      </div>
                    </article>
                  );
                }

                const h = a as HighlightViewModel;
                const vars = toAnnotationCssVars(h.color);
                const quoteText = h.text ? normalizeQuoteTextForDisplay(h.text) : "";
                const when =
                  h.timestamp && !Number.isNaN(Date.parse(h.timestamp)) ? new Date(h.timestamp).toLocaleString() : null;
                const isEditing = editingId === h.id;
                const canSave = editStatus !== "saving" && !busy;
                return (
                  <article
                    key={h.id}
                    className="spAnnotationCard"
                    style={{ ["--annotation-color" as any]: vars.color, ["--annotation-bg" as any]: vars.bg }}
                  >
                    <div className="spAnnotationLeftRail" aria-hidden="true">
                      <span className="spAnnotationTypeIcon" title="Highlight">
                        <MaterialIcon name="border_color" />
                      </span>
                    </div>

                    <div className="spAnnotationBody">
                      <div className="spAnnotationQuote" title={quoteText || "Highlight"}>
                        {quoteText || "Highlight"}
                      </div>

                      {!isEditing && h.note ? <div className="spAnnotationNote">{h.note}</div> : null}

                      {!isEditing ? (
                        <div className="spAnnotationActionRow">
                          <div className="muted spAnnotationActionMeta" title={h.label}>
                            {h.label}
                            {h.descriptionStatus === "loading" ? <span className="muted">{` ${"\u2026"}`}</span> : null}
                            {when ? <span className="muted">{` \u00B7 ${when}`}</span> : null}
                          </div>
                        </div>
                      ) : null}

                      {isEditing ? (
                        <form
                          className="spAnnotationEditForm"
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (!canSave) return;
                            setEditStatus("saving");
                            setEditError(null);
                            void (async () => {
                              try {
                                await onUpdateHighlight(h.id, { note: draftNote, color: draftColor });
                                setEditStatus("idle");
                                setEditingId(null);
                              } catch (err) {
                                setEditStatus("error");
                                setEditError(err instanceof Error ? err.message : "Failed to update highlight.");
                              }
                            })();
                          }}
                        >
                          <div className="spAnnotationEditRow">
                            <textarea
                              id={`note-${h.id}`}
                              className="input spAnnotationEditTextarea"
                              rows={3}
                              value={draftNote}
                              onChange={(ev) => setDraftNote(ev.currentTarget.value)}
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
                                  onClick={() => setDraftColor(token)}
                                  aria-label={`Color ${token}`}
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
                                onClick={() => {
                                  setEditingId(null);
                                  setEditStatus("idle");
                                  setEditError(null);
                                }}
                                disabled={editStatus === "saving"}
                              >
                                <MaterialIcon name="close" />
                              </button>
                            </div>

                            <div className="muted spAnnotationActionMeta" title={h.label}>
                              {h.label}
                              {h.descriptionStatus === "loading" ? <span className="muted">{` ${"\u2026"}`}</span> : null}
                              {when ? <span className="muted">{` \u00B7 ${when}`}</span> : null}
                            </div>
                          </div>
                        </form>
                      ) : null}
                    </div>

                    <div className="spAnnotationRightRail" aria-label="Highlight actions">
                      {!isEditing ? (
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
                          title="Edit"
                          disabled={editStatus === "saving"}
                        >
                          <MaterialIcon name="edit" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="button buttonCompact spIconButton"
                        onClick={() => {
                          if (!window.confirm("Delete this annotation?")) return;
                          onRemoveAnnotation(h.id);
                        }}
                        aria-label="Remove highlight"
                        title="Remove"
                        disabled={editStatus === "saving"}
                      >
                        <MaterialIcon name="delete" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : (
        <div role="tabpanel" className="spAnnotationTabPanel">
          <div className="muted">Previous session layers are not wired yet.</div>
          <div className="spAnnotationPreviousPlaceholder">
            <label className="muted" htmlFor="prevLayers">
              Select layers
            </label>
            <select id="prevLayers" className="input" disabled value="">
              <option value="">Select layers…</option>
            </select>
          </div>
        </div>
      )}
    </section>
  );
}
