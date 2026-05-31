import { useMemo, useState } from "react";
import type { ReadingSessionState } from "../session/types";
import type { ReaderBookmarkViewModel } from "./bookmarkUtils";
import { toAnnotationCssVars } from "./annotationColors";

type TabKey = "current" | "previous";

export type HighlightViewModel = {
  kind: "highlight";
  id: string;
  cfiRange: string;
  text: string;
  note?: string;
  color?: string;
  timestamp?: string;
  label: string;
  descriptionStatus: "idle" | "loading" | "ready" | "error";
};

export type CurrentSessionAnnotationViewModel = ReaderBookmarkViewModel | HighlightViewModel;

export function AnnotationWorkspace({
  state,
  annotations,
  currentCfi,
  onJumpToTarget,
  onRemoveAnnotation,
}: {
  state: ReadingSessionState;
  annotations: CurrentSessionAnnotationViewModel[];
  currentCfi?: string | null;
  onJumpToTarget: (target: { type: "cfi"; cfi: string } | { type: "cfiRange"; cfiRange: string }) => void;
  onRemoveAnnotation: (annotationId: string) => void;
}) {
  const [tab, setTab] = useState<TabKey>("current");

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
          {annotations.length === 0 ? <div className="muted">No annotations yet.</div> : null}

          {annotations.length > 0 ? (
            <div className="spAnnotationList" aria-label="Current session annotations">
              {annotations.map((a) => {
                if ("cfi" in a) {
                  const b = a;
                  const isCurrent = b.isCurrent || Boolean(currentCfi && b.cfi === currentCfi);

                  return (
                    <article key={b.id} className={`spAnnotationCard ${isCurrent ? "spAnnotationCardCurrent" : ""}`}>
                      <div className="spAnnotationActionRail" aria-label="Bookmark actions">
                        <button
                          type="button"
                          className="button buttonCompact"
                          onClick={() => onJumpToTarget({ type: "cfi", cfi: b.cfi })}
                          aria-label="Jump to bookmark"
                          title="Jump"
                        >
                          Jump
                        </button>
                        <button
                          type="button"
                          className="button buttonCompact"
                          onClick={() => onRemoveAnnotation(b.id)}
                          aria-label="Remove bookmark"
                          title="Remove"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="spAnnotationBody">
                        <div className="spAnnotationKindRow">
                          <span className="spAnnotationKind">Bookmark</span>
                          {isCurrent ? <span className="spAnnotationBadge">Current</span> : null}
                        </div>

                        <div className="spAnnotationPrimary" title={b.label}>
                          {b.label}
                          {b.descriptionStatus === "loading" ? <span className="muted">{` ${"\u2026"}`}</span> : null}
                        </div>

                        <div className="muted spAnnotationMetaLine">Saved location</div>
                      </div>
                    </article>
                  );
                }

                const h = a as HighlightViewModel;
                const vars = toAnnotationCssVars(h.color);
                const when =
                  h.timestamp && !Number.isNaN(Date.parse(h.timestamp)) ? new Date(h.timestamp).toLocaleString() : null;
                return (
                  <article
                    key={h.id}
                    className="spAnnotationCard"
                    style={{ ["--annotation-color" as any]: vars.color, ["--annotation-bg" as any]: vars.bg }}
                  >
                    <div className="spAnnotationActionRail" aria-label="Highlight actions">
                      <button
                        type="button"
                        className="button buttonCompact"
                        onClick={() => onJumpToTarget({ type: "cfiRange", cfiRange: h.cfiRange })}
                        aria-label="Jump to highlight"
                        title="Jump"
                      >
                        Jump
                      </button>
                      <button
                        type="button"
                        className="button buttonCompact"
                        onClick={() => onRemoveAnnotation(h.id)}
                        aria-label="Remove highlight"
                        title="Remove"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="spAnnotationBody">
                      <div className="spAnnotationKindRow">
                        <span className="spAnnotationKind">Highlight</span>
                      </div>

                      <div className="spAnnotationQuote" title={h.text}>
                        {h.text || "Highlight"}
                      </div>

                      {h.note ? <div className="spAnnotationNote">{h.note}</div> : null}

                      <div className="muted spAnnotationMetaLine" title={h.label}>
                        {h.label}
                        {h.descriptionStatus === "loading" ? <span className="muted">{` ${"\u2026"}`}</span> : null}
                        {when ? <span className="muted">{` \u00B7 ${when}`}</span> : null}
                      </div>
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
