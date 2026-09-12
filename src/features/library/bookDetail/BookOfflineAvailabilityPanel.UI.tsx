import type { BookOfflineAvailabilityController } from "./BookOfflineAvailability.Controller";

export function BookOfflineAvailabilityPanel({
  controller,
  onManageOffline,
}: {
  controller: BookOfflineAvailabilityController;
  onManageOffline: () => void;
}) {
  const { state } = controller;
  const working = state.status === "working";
  const label = getStatusLabel(state);

  return (
    <div className="bookOfflineAvailability" aria-live="polite">
      <div className="bookOfflineAvailabilityStatus">
        <strong>Offline copy</strong>
        <span className={state.status === "error" ? "errorText" : "muted"}>{label}</span>
        {state.status !== "loading" && state.status !== "working" && state.message ? (
          <span className="errorText">{state.message}</span>
        ) : null}
      </div>

      {state.status === "not-available" || state.status === "error" ? (
        <button type="button" className="button" onClick={() => void controller.acquire()}>
          Make available offline
        </button>
      ) : null}
      {state.status === "needs-update" ? (
        <button type="button" className="button" onClick={() => void controller.acquire()}>
          Update offline copy
        </button>
      ) : null}
      {state.status === "available" ? (
        <>
          <button type="button" className="button" onClick={onManageOffline}>Manage offline</button>
          <button type="button" className="button" onClick={() => void controller.remove()}>
            Remove offline copy
          </button>
        </>
      ) : null}
      {state.status === "needs-update" ? (
        <button type="button" className="button" onClick={onManageOffline}>Manage offline</button>
      ) : null}
      {working ? (
        <button type="button" className="button" disabled>
          {state.operation === "remove" ? "Removing offline copy..." : "Preparing offline copy..."}
        </button>
      ) : null}
    </div>
  );
}

function getStatusLabel(state: BookOfflineAvailabilityController["state"]): string {
  switch (state.status) {
    case "loading": return "Checking availability...";
    case "working": return state.operation === "remove" ? "Removing offline copy..." : "Preparing offline copy...";
    case "available": return "Available offline";
    case "needs-update": return "Offline copy needs an update";
    case "not-available": return "Not available offline";
    case "unverifiable": return "Offline copy can't be verified.";
    case "unsupported": return "Offline storage isn't available.";
    case "error": return "Couldn't check offline status.";
  }
}
