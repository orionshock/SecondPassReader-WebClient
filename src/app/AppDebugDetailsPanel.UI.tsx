import type { AppWorkflowStep } from "./AppWorkflow.Policy";
import type { ActiveConnection } from "../storage/ActiveConnection.Store";
import { buildOfflineCacheNamespace } from "./offline/namespace/OfflineCacheNamespace.Policy";

export function DebugDetails({
  step,
  activeConnectionId,
  connection,
}: {
  step: AppWorkflowStep;
  activeConnectionId: string | null;
  connection: ActiveConnection | null;
}) {
  const namespace = connection?.verifiedAt
    ? buildOfflineCacheNamespace({ serverId: connection.serverId, profileId: connection.verifiedUser?.profileId })
    : null;
  return (
    <details className="debugDetails">
      <summary>Debug details</summary>
      <div className="debugGrid">
        <div className="detailRow">
          <span className="muted">workflow step:</span> <span className="mono">{step}</span>
        </div>
        <div className="detailRow">
          <span className="muted">selected connection id:</span>{" "}
          <span className="mono">{activeConnectionId ?? "-"}</span>
        </div>
        {connection ? (
          <>
            <div className="detailRow">
              <span className="muted">current route:</span> <span className="mono">{connection.serverBaseUrl}</span>
            </div>
            <div className="detailRow">
              <span className="muted">server ID:</span> <span className="mono">{connection.serverId}</span>
            </div>
            <div className="detailRow">
              <span className="muted">profile ID:</span> <span className="mono">{connection.verifiedUser?.profileId ?? "-"}</span>
            </div>
            <div className="detailRow">
              <span className="muted">offline namespace:</span> <span className="mono">{namespace?.key ?? "-"}</span>
            </div>
            <div className="detailRow">
              <span className="muted">declared routes:</span> <span className="mono">{connection.serverUrls.join(", ") || "-"}</span>
            </div>
            <div className="detailRow">
              <span className="muted">discovery:</span> {connection.clientApi ? "stored" : "missing"}
            </div>
            <div className="detailRow">
              <span className="muted">access token:</span> {connection.accessToken ? "stored" : "missing"}
            </div>
            <div className="detailRow">
              <span className="muted">clientSessionId:</span> <span className="mono">{connection.clientSessionId ?? "-"}</span>
            </div>
            <div className="detailRow">
              <span className="muted">clientSessionName:</span>{" "}
              <span className="mono">{connection.clientSessionName ?? "-"}</span>
            </div>
            <div className="detailRow">
              <span className="muted">linkedAt:</span> <span className="mono">{connection.linkedAt ?? "-"}</span>
            </div>
            <div className="detailRow">
              <span className="muted">verifiedAt:</span> <span className="mono">{connection.verifiedAt ?? "-"}</span>
            </div>
            <div className="detailRow">
              <span className="muted">verified user:</span> <span className="mono">{connection.verifiedUser?.username ?? "-"}</span>
            </div>
          </>
        ) : null}
      </div>
    </details>
  );
}
