import type { AppWorkflowStep } from "./appWorkflow";
import type { ConnectionProfile } from "../storage/connectionProfiles";

export function DebugDetails({
  step,
  selectedProfileId,
  profile,
}: {
  step: AppWorkflowStep;
  selectedProfileId: string | null;
  profile: ConnectionProfile | null;
}) {
  return (
    <details className="debugDetails">
      <summary>Debug details</summary>
      <div className="debugGrid">
        <div className="detailRow">
          <span className="muted">workflow step:</span> <span className="mono">{step}</span>
        </div>
        <div className="detailRow">
          <span className="muted">selected profile id:</span>{" "}
          <span className="mono">{selectedProfileId ?? "—"}</span>
        </div>
        {profile ? (
          <>
            <div className="detailRow">
              <span className="muted">serverBaseUrl:</span> <span className="mono">{profile.serverBaseUrl}</span>
            </div>
            <div className="detailRow">
              <span className="muted">apiBaseUrl:</span> <span className="mono">{profile.apiBaseUrl ?? "—"}</span>
            </div>
            <div className="detailRow">
              <span className="muted">discovery:</span> {profile.clientApi ? "stored" : "missing"}
            </div>
            <div className="detailRow">
              <span className="muted">access token:</span> {profile.accessToken ? "stored" : "missing"}
            </div>
            <div className="detailRow">
              <span className="muted">clientSessionId:</span>{" "}
              <span className="mono">{profile.clientSessionId ?? "—"}</span>
            </div>
            <div className="detailRow">
              <span className="muted">linkedAt:</span> <span className="mono">{profile.linkedAt ?? "—"}</span>
            </div>
            <div className="detailRow">
              <span className="muted">verifiedAt:</span> <span className="mono">{profile.verifiedAt ?? "—"}</span>
            </div>
            <div className="detailRow">
              <span className="muted">verified user:</span>{" "}
              <span className="mono">{profile.verifiedUser?.username ?? "—"}</span>
            </div>
          </>
        ) : null}
      </div>
    </details>
  );
}

