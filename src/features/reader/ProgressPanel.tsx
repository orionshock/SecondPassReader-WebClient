export type ProgressSaveState =
  | { phase: "idle" }
  | { phase: "saving" }
  | { phase: "success"; savedAt: string; progress: unknown }
  | { phase: "error"; message: string };

export type ProgressAutosaveState = {
  enabled: boolean;
  status: "idle" | "dirty" | "waiting" | "saving" | "saved" | "error";
  lastAutosavedAt?: string;
  lastAutosavedCfi?: string;
  error?: string;
};

export function ProgressPanel({
  autosave,
  currentHref,
  progression,
}: {
  autosave: ProgressAutosaveState;
  currentHref?: string;
  progression?: number | null;
}) {
  const statusLabel = (() => {
    if (!autosave.enabled) return "Autosave off";
    if (autosave.status === "saving") return "Saving";
    if (autosave.status === "waiting") return "Waiting to autosave";
    if (autosave.status === "dirty") return "Unsaved progress";
    if (autosave.status === "saved") return "Autosaved";
    if (autosave.status === "error") return "Autosave error";
    return "Autosave on";
  })();

  const progressPct =
    progression != null && Number.isFinite(progression) ? `${Math.round(progression * 1000) / 10}%` : null;

  return (
    <div className="progressLine">
      <span className="muted">Progress:</span>{" "}
      <span>{statusLabel}</span>
      {progressPct ? <span className="muted"> {"\u00B7"} {progressPct}</span> : null}
      {currentHref ? <span className="muted"> {"\u00B7"} {currentHref}</span> : null}
      {autosave.lastAutosavedAt ? <span className="muted"> {"\u00B7"} {autosave.lastAutosavedAt}</span> : null}
      {autosave.status === "error" && autosave.error ? <span className="errorText"> {"\u00B7"} {autosave.error}</span> : null}
    </div>
  );
}
