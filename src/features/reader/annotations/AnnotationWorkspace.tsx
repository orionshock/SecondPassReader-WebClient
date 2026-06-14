import { useEffect, useRef, useState } from "react";
import { ANNOTATION_COLOR_TOKENS, toAnnotationCssVars } from "./annotationColors";
import type { HighlightViewModel, CurrentSessionAnnotationViewModel } from "./viewModels";
import { ANNOTATION_LIMITS } from "./annotationLimits";
import { MaterialIcon } from "../../../components/MaterialIcon";
import { InlineMeta } from "../../../components/MetaSeparator";
import { BOOKMARK_DISPLAY, getHighlightAnnotationDisplay } from "./annotationDisplay";
import { PreviousSessionAnnotationsPanel } from "./PreviousSessionAnnotationsPanel";
import type { PreviousSessionAnnotationGroup } from "../session/usePreviousSessionLayers";
import { CurrentSessionMetadataEditor } from "./CurrentSessionMetadataEditor";

type TabKey = "current" | "previous";

function normalizeQuoteTextForDisplay(text: string): string {
  // Selections and describing bodies can contain hard line separators and trailing whitespace.
  // For card display, normalize to a single-line flow so we don't render what looks like a
  // "blank line" at the end of the quote block.
  return text.replace(/\s+/g, " ").trim();
}

export function AnnotationWorkspace({
  annotations,
  status,
  error,
  busy,
  currentCfi,
  previousSessionGroups,
  onEnablePreviousSession,
  currentSessionMeta,
  onUpdateCurrentSessionMeta,
  focusRequest,
  onRemoveAnnotation,
  onUpdateHighlight,
  onJumpToCfi,
  onJumpToCfiRange,
}: {
  annotations: CurrentSessionAnnotationViewModel[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  busy: boolean;
  currentCfi?: string | null;
  previousSessionGroups?: PreviousSessionAnnotationGroup[];
  onEnablePreviousSession?: (sessionId: string) => void;
  currentSessionMeta?: { name: string | null; notes: string | null; status: "idle" | "loading" | "ready" | "error"; error: string | null };
  onUpdateCurrentSessionMeta?: (update: { name: string; notes: string }) => Promise<void>;
  focusRequest?: { annotationId: string; mode: "editable" | "readonly"; seq: number } | null;
  onRemoveAnnotation: (annotationId: string) => void;
  onUpdateHighlight: (annotationId: string, update: { note: string; color: string }) => Promise<void>;
  onJumpToCfi: (cfi: string) => void;
  onJumpToCfiRange: (cfiRange: string) => void;
}) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [tab, setTab] = useState<TabKey>("current");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState<string>("");
  const [draftColor, setDraftColor] = useState<string>("yellow");
  const [editStatus, setEditStatus] = useState<"idle" | "saving" | "error">("idle");
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (!focusRequest?.annotationId) return;
    setTab(focusRequest.mode === "readonly" ? "previous" : "current");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const root = rootRef.current;
        if (!root) return;
        const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-annotation-id]"));
        const card = cards.find((item) => item.dataset.annotationId === focusRequest.annotationId);
        card?.scrollIntoView({ behavior: "smooth", block: "center" });
        card?.focus({ preventScroll: true });
      });
    });
  }, [focusRequest]);

  return (
    <section ref={rootRef} className="panel spAnnotationWorkspace">
      <div className="spAnnotationWorkspaceHeader">
        <div className="spAnnotationWorkspaceHeaderTop">
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
        </div>
        {currentSessionMeta && onUpdateCurrentSessionMeta ? (
          <div className="spAnnotationWorkspaceHeaderMeta">
            <CurrentSessionMetadataEditor
              name={currentSessionMeta.name}
              notes={currentSessionMeta.notes}
              loadStatus={currentSessionMeta.status}
              loadError={currentSessionMeta.error}
              busy={busy}
              onSave={onUpdateCurrentSessionMeta}
            />
          </div>
        ) : null}
      </div>

      {tab === "current" ? (
        <div role="tabpanel" className="spAnnotationTabPanel">
          {status === "loading" ? <div className="muted">Loading annotations...</div> : null}
          {status === "error" && error ? <div className="muted">Failed to load annotations: {error}</div> : null}
          {busy ? <div className="muted">Updating annotations...</div> : null}
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
                      tabIndex={-1}
                      data-annotation-id={b.id}
                      className={`spAnnotationCard spAnnotationCardBookmark ${isCurrent ? "spAnnotationCardCurrent" : ""}`}
                    >
                      <div className="spAnnotationLeftRail" aria-hidden="true">
                        <span className="spAnnotationTypeIcon" title={BOOKMARK_DISPLAY.label}>
                          <MaterialIcon name={BOOKMARK_DISPLAY.iconName} />
                        </span>
                      </div>

                      <div className="spAnnotationBody">
                        <div className="spAnnotationBookmarkRow" title={b.label}>
                          <span className="spAnnotationBookmarkText">
                            <InlineMeta items={["Bookmark", ...b.labelParts]} />
                            {b.descriptionStatus === "loading" ? <span className="muted">{` ${"\u2026"}`}</span> : null}
                          </span>
                          {isCurrent ? <span className="spAnnotationBadge">Current</span> : null}
                        </div>
                      </div>

                      <div className="spAnnotationRightRail" aria-label="Bookmark actions">
                        <button
                          type="button"
                          className="button buttonCompact spIconButton"
                          onClick={() => onJumpToCfi(b.cfi)}
                          aria-label="Jump to bookmark"
                          title="Jump to location"
                        >
                          <MaterialIcon name="my_location" />
                        </button>
                        <button
                          type="button"
                          className="button buttonDanger buttonCompact spIconButton"
                          onClick={() => {
                            if (!window.confirm("Delete this bookmark?")) return;
                            onRemoveAnnotation(b.id);
                          }}
                          aria-label="Delete bookmark"
                          title="Delete bookmark"
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
                      <div className="spAnnotationQuote" title={quoteText || "Highlight"}>
                        {quoteText || "Highlight"}
                      </div>

                      {!isEditing && h.note ? <div className="spAnnotationNote">{h.note}</div> : null}

                      {!isEditing ? (
                        <div className="spAnnotationActionRow">
                          <div className="muted spAnnotationActionMeta" title={h.label}>
                            <InlineMeta items={[h.label, when]} />
                            {h.descriptionStatus === "loading" ? <span className="muted">{` ${"\u2026"}`}</span> : null}
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
                              <InlineMeta items={[h.label, when]} />
                              {h.descriptionStatus === "loading" ? <span className="muted">{` ${"\u2026"}`}</span> : null}
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
                          aria-label="Edit note and color"
                          title="Edit note and color"
                          disabled={editStatus === "saving"}
                        >
                          <MaterialIcon name="edit_note" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="button buttonCompact spIconButton"
                        onClick={() => onJumpToCfiRange(h.cfiRange)}
                        aria-label="Jump to highlight"
                        title="Jump to location"
                        disabled={editStatus === "saving"}
                      >
                        <MaterialIcon name="my_location" />
                      </button>
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
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : (
        <div role="tabpanel" className="spAnnotationTabPanel">
          <PreviousSessionAnnotationsPanel
            groups={previousSessionGroups ?? []}
            onEnableInMarginalia={(sessionId) => onEnablePreviousSession?.(sessionId)}
            onJumpToCfi={onJumpToCfi}
            onJumpToCfiRange={onJumpToCfiRange}
          />
        </div>
      )}
    </section>
  );
}
