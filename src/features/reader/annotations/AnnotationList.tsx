import type { ReadingSessionState } from "../session/types";
import type { ReaderBookmark } from "./bookmarkUtils";

export function AnnotationList({
  state,
  bookmarks,
  currentCfi,
  onJumpToCfi,
  onRemoveBookmark,
}: {
  state: ReadingSessionState;
  bookmarks: ReaderBookmark[];
  currentCfi?: string | null;
  onJumpToCfi: (cfi: string) => void;
  onRemoveBookmark: (bookmarkId: string) => void;
}) {
  return (
    <section className="panel spAnnotationList">
      <h2 className="panelTitle">Bookmarks</h2>
      <div className="muted">Session: {state.sessionId ?? "(none yet)"}</div>
      {bookmarks.length === 0 ? <div className="muted">No bookmarks yet.</div> : null}

      {bookmarks.length > 0 ? (
        <div className="spBookmarkList">
          {bookmarks.map((b) => {
            const isCurrent = Boolean(currentCfi && b.cfi === currentCfi);
            return (
              <div key={b.id} className={`spBookmarkRow ${isCurrent ? "spBookmarkRowCurrent" : ""}`}>
                <div className="spBookmarkMain">
                  <div className="mono spBookmarkCfi" title={b.cfi}>
                    {b.cfi.slice(0, 120)}
                    {b.cfi.length > 120 ? "…" : ""}
                  </div>
                  {isCurrent ? <div className="muted">Current location</div> : null}
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
