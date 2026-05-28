import type { LibraryBook } from "@secondpass/client";
import type { ReadingSessionState } from "../session/types";

export function AnnotationList({
  state,
  onOpenBook,
}: {
  state: ReadingSessionState;
  onOpenBook?: (book: LibraryBook) => Promise<void>;
}) {
  return (
    <section className="panel spAnnotationList">
      <h2 className="panelTitle">Annotations</h2>
      <div className="muted">AnnotationList placeholder (session-owned; does not know engine details)</div>
      <div className="muted">Session: {state.sessionId ?? "(none yet)"}</div>
      {onOpenBook ? <div className="muted">onOpenBook is wired for near-end/session workflows (not implemented here)</div> : null}
    </section>
  );
}

