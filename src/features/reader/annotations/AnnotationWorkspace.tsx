import { useMemo, useState } from "react";
import type { ReadingSessionState } from "../session/types";
import type { ReaderBookmarkViewModel } from "./bookmarkUtils";

type TabKey = "current" | "previous";

export function AnnotationWorkspace({
  state,
  annotations,
  currentCfi,
  onJumpToTarget,
  onRemoveAnnotation,
}: {
  state: ReadingSessionState;
  annotations: Array<
    | ReaderBookmarkViewModel
    | { kind: "highlight"; id: string; cfiRange: string; text: string; label: string; descriptionStatus: "idle" | "loading" | "ready" | "error" }
  >;
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
            <div className="spBookmarkList">
              {annotations.map((a) => {
                if ("cfi" in a) {
                  const b = a;
                  const isCurrent = b.isCurrent || Boolean(currentCfi && b.cfi === currentCfi);
                  return (
                    <div key={b.id} className={`spBookmarkRow ${isCurrent ? "spBookmarkRowCurrent" : ""}`}>
                      <div className="spBookmarkMain">
                        <div className="spBookmarkLabel" title={b.label}>
                          {b.label}
                          {b.descriptionStatus === "loading" ? <span className="muted">{` ${"\u2026"}`}</span> : null}
                        </div>
                        {isCurrent ? <div className="muted">Current location</div> : null}
                        <div className="mono muted spBookmarkCfi" title={b.cfi}>
                          {b.cfi.slice(0, 80)}
                          {b.cfi.length > 80 ? "…" : ""}
                        </div>
                      </div>
                      <div className="spBookmarkActions">
                        <button type="button" className="button buttonCompact" onClick={() => onJumpToTarget({ type: "cfi", cfi: b.cfi })}>
                          Jump
                        </button>
                        <button type="button" className="button buttonCompact" onClick={() => onRemoveAnnotation(b.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                }

                const h = a;
                return (
                  <div key={h.id} className="spBookmarkRow">
                    <div className="spBookmarkMain">
                      <div className="spBookmarkLabel" title={h.text}>
                        {h.text ? (h.text.length > 120 ? `${h.text.slice(0, 120)}…` : h.text) : "Highlight"}
                      </div>
                      <div className="muted" title={h.label}>
                        {h.label}
                        {h.descriptionStatus === "loading" ? <span className="muted">{` ${"\u2026"}`}</span> : null}
                      </div>
                      <div className="mono muted spBookmarkCfi" title={h.cfiRange}>
                        {h.cfiRange.slice(0, 80)}
                        {h.cfiRange.length > 80 ? "…" : ""}
                      </div>
                    </div>
                    <div className="spBookmarkActions">
                      <button
                        type="button"
                        className="button buttonCompact"
                        onClick={() => onJumpToTarget({ type: "cfiRange", cfiRange: h.cfiRange })}
                      >
                        Jump
                      </button>
                      <button type="button" className="button buttonCompact" onClick={() => onRemoveAnnotation(h.id)}>
                        Remove
                      </button>
                    </div>
                  </div>
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
