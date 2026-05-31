import { useMemo, useState } from "react";
import type { ReadingSessionState } from "../session/types";
import type { ReaderBookmarkViewModel } from "./bookmarkUtils";

type TabKey = "current" | "previous";

export function AnnotationWorkspace({
  state,
  bookmarks,
  currentCfi,
  onJumpToCfi,
  onRemoveBookmark,
}: {
  state: ReadingSessionState;
  bookmarks: ReaderBookmarkViewModel[];
  currentCfi?: string | null;
  onJumpToCfi: (cfi: string) => void;
  onRemoveBookmark: (bookmarkId: string) => void;
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
      </div>

      {tab === "current" ? (
        <div role="tabpanel" className="spAnnotationTabPanel">
          <div className="muted spAnnotationWorkspaceHint">Bookmarks are shown here until highlights and notes are wired.</div>
          <div className="muted">Session: {sessionLabel}</div>

          {bookmarks.length === 0 ? <div className="muted">No bookmarks yet.</div> : null}
          {bookmarks.length > 0 ? (
            <div className="spBookmarkList">
              {bookmarks.map((b) => {
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
                      <button type="button" className="button buttonCompact" onClick={() => onJumpToCfi(b.cfi)}>
                        Jump
                      </button>
                      <button type="button" className="button buttonCompact" onClick={() => onRemoveBookmark(b.id)}>
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
