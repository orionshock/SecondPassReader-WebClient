import type { ReadingSessionState } from "../session/types";
import type { ReaderBookmarkViewModel } from "./bookmarkUtils";

export function AnnotationList({
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
  return (
    <section className="panel spAnnotationList">
      <h2 className="panelTitle">Annotations</h2>
      <div className="muted">Showing bookmarks only</div>
      <div className="muted">Session: {state.sessionId ?? "(none yet)"}</div>
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
    </section>
  );
}
