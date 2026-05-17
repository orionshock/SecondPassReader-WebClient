import type { ReadingProgress, ReadingProgressUpdatePayload } from "../../schemas/readingSession";

export type ProgressSaveState =
  | { phase: "idle" }
  | { phase: "saving" }
  | { phase: "success"; savedAt: string; progress: ReadingProgress }
  | { phase: "error"; message: string };

export function ProgressPanel({
  currentCfi,
  currentHref,
  progression,
  displayed,
  canSave,
  saveState,
  progressPayload,
  onSave,
}: {
  currentCfi: string | null;
  currentHref: string | undefined;
  progression: number | null;
  displayed?: { page: number; total: number } | null;
  canSave: boolean;
  saveState: ProgressSaveState;
  progressPayload: ReadingProgressUpdatePayload | null;
  onSave: () => void;
}) {
  return (
    <section className="panel progressPanel">
      <h2 className="panelTitle">Progress</h2>

      <div className="detailRow">
        <span className="muted">Current CFI:</span>{" "}
        {currentCfi ? <span className="mono">{currentCfi}</span> : <span className="muted">No current location yet</span>}
      </div>

      <div className="detailRow">
        <span className="muted">Href:</span>{" "}
        {currentHref ? <span className="mono">{currentHref}</span> : <span className="muted">not available</span>}
      </div>

      <div className="detailRow">
        <span className="muted">Progression:</span>{" "}
        {progression != null ? <span className="mono">{Math.round(progression * 1000) / 10}%</span> : <span className="muted">not available</span>}
      </div>

      {displayed ? (
        <div className="detailRow">
          <span className="muted">Displayed:</span>{" "}
          <span className="mono">
            {displayed.page}/{displayed.total}
          </span>
        </div>
      ) : null}

      <div className="formActions" style={{ marginTop: 8 }}>
        <button type="button" className="button buttonPrimary" onClick={onSave} disabled={!canSave}>
          {saveState.phase === "saving" ? "Saving..." : "Save progress"}
        </button>
      </div>

      {saveState.phase === "success" ? (
        <div className="muted" style={{ marginTop: 8 }}>
          <span className="pill pillOk">Progress saved</span> <span className="mono">{saveState.savedAt}</span>
        </div>
      ) : null}
      {saveState.phase === "error" ? (
        <p className="errorText" style={{ marginTop: 8 }}>
          {saveState.message}
        </p>
      ) : null}

      <details style={{ marginTop: 10 }}>
        <summary className="muted">Progress payload preview</summary>
        <pre className="codeBlock">{JSON.stringify(progressPayload ?? { note: "No current location yet." }, null, 2)}</pre>
      </details>

      {saveState.phase === "success" ? (
        <details style={{ marginTop: 10 }}>
          <summary className="muted">Saved progress response</summary>
          <pre className="codeBlock">{JSON.stringify(saveState.progress, null, 2)}</pre>
        </details>
      ) : null}
    </section>
  );
}

