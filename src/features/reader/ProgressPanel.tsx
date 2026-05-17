import type { ReadingProgress, ReadingProgressUpdatePayload } from "../../schemas/readingSession";

export type ProgressSaveState =
  | { phase: "idle" }
  | { phase: "saving" }
  | { phase: "success"; savedAt: string; progress: ReadingProgress }
  | { phase: "error"; message: string };

export type ProgressAutosaveState = {
  enabled: boolean;
  status: "idle" | "dirty" | "waiting" | "saving" | "saved" | "error";
  lastAutosavedAt?: string;
  lastAutosavedCfi?: string;
  error?: string;
};

export function ProgressPanel({
  currentCfi,
  currentHref,
  progression,
  displayed,
  canSave,
  saveState,
  autosave,
  onToggleAutosave,
  progressPayload,
  onSave,
}: {
  currentCfi: string | null;
  currentHref: string | undefined;
  progression: number | null;
  displayed?: { page: number; total: number } | null;
  canSave: boolean;
  saveState: ProgressSaveState;
  autosave: ProgressAutosaveState;
  onToggleAutosave: (enabled: boolean) => void;
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

      <div className="detailRow">
        <span className="muted">Autosave:</span>{" "}
        <label className="muted" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={autosave.enabled}
            onChange={(e) => onToggleAutosave(e.target.checked)}
          />
          Autosave progress
        </label>
      </div>

      <div className="detailRow">
        <span className="muted">Status:</span>{" "}
        {autosave.status === "saving" ? (
          <span className="pill pillIdle">Autosaving</span>
        ) : autosave.status === "waiting" ? (
          <span className="pill pillIdle">Waiting to autosave</span>
        ) : autosave.status === "dirty" ? (
          <span className="pill pillIdle">Unsaved changes</span>
        ) : autosave.status === "saved" ? (
          <span className="pill pillOk">Autosaved</span>
        ) : autosave.status === "error" ? (
          <span className="pill pillWarn">Autosave error</span>
        ) : (
          <span className="muted">idle</span>
        )}
        {autosave.lastAutosavedAt ? <span className="mono"> · {autosave.lastAutosavedAt}</span> : null}
      </div>

      {autosave.status === "error" && autosave.error ? <div className="errorText">{autosave.error}</div> : null}

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
