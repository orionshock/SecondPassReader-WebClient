import type { ActiveConnection } from "../../storage/ActiveConnection.Store";
import { APP_BUILD_INFO } from "../AppBuildInfo.Constants";
import { ServerRichText } from "../../components/ServerRichText.Renderer";
import { getConnectionStatus, getConnectionStatusLabel } from "../../features/connection/ConnectionStatus.Presenter";
import { SettingsDetailRow } from "./SettingsDetailRow.UI";

export type SettingsLibraryServerActionState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "trying" }
  | { phase: "logging_out" }
  | { phase: "signing_out_locally" }
  | { phase: "forgetting" }
  | { phase: "success"; message: string }
  | { phase: "error"; message: string; action: "check" | "logout" | "forget"; technicalDetail?: string | null };

export function SettingsLibraryServerPanel({
  connection,
  state,
  busy,
  onConnect,
  onCheckConnection,
  onLogOut,
  onSignOutLocally,
  onRepairConnection,
  onForgetLocally,
  serverActionsAvailable,
}: {
  connection: ActiveConnection | null;
  state: SettingsLibraryServerActionState;
  busy: boolean;
  onConnect: () => void;
  onCheckConnection: () => void;
  onLogOut: () => void;
  onSignOutLocally: () => void;
  onRepairConnection: () => void;
  onForgetLocally: () => void;
  serverActionsAvailable: boolean;
}) {
  const status = getConnectionStatus(connection);

  return (
    <div className="settingsTabPanel">
      <section className="panel settingsCard">
        <div className="settingsSectionHeader">
          <h2 className="panelTitle">Connection</h2>
          <span className={`pill ${status === "verified" ? "pillOk" : status === "not_configured" ? "pillIdle" : "pillWarn"}`}>
            {getConnectionStatusLabel(status)}
          </span>
        </div>

        {!connection ? (
          <div className="settingsEmpty">
            <p className="muted">This browser isn't connected to Second Pass Library.</p>
            <button type="button" className="button buttonPrimary" onClick={onConnect} disabled={!serverActionsAvailable}>
              Connect
            </button>
          </div>
        ) : (
          <>
            <div className="settingsGrid">
              <SettingsDetailRow label="Library" value={connection.serverName ?? connection.label} />
              {connection.serverDescription ? (
                <div className="detailRow">
                  <span className="muted">Description:</span>
                  <ServerRichText value={connection.serverDescription} />
                </div>
              ) : null}
              <SettingsDetailRow label="Library URL" value={connection.serverBaseUrl} mono />
              <SettingsDetailRow label="Account" value={formatUser(connection)} />
              <SettingsDetailRow label="Browser name" value={connection.clientSessionName ?? "Unknown"} />
              <SettingsDetailRow label="Last checked" value={formatTimestamp(connection.lastCheckedAt ?? connection.verifiedAt)} />
            </div>
            <div className="settingsActions">
              <button type="button" className="button" onClick={onCheckConnection} disabled={busy || !serverActionsAvailable}>
                {state.phase === "trying" ? "Trying another Library URL..."
                  : state.phase === "checking" ? `Checking${"\u2026"}` : "Check connection"}
              </button>
              <button type="button" className="button buttonPrimary" onClick={onRepairConnection} disabled={busy || !serverActionsAvailable}>
                Repair connection
              </button>
            </div>
            {!serverActionsAvailable ? <p className="muted">Connection actions are unavailable while offline.</p> : null}
          </>
        )}
      </section>

      <section className="panel settingsCard">
        <div className="settingsSectionHeader">
          <h2 className="panelTitle">This browser</h2>
        </div>
        <p className="muted">
          Signing out revokes this browser's session and removes this connection and its offline data from this browser.
        </p>
        <div className="settingsGrid">
          <SettingsDetailRow label="Web client version" value={APP_BUILD_INFO.version} mono />
          <SettingsDetailRow label="Web client release date" value={APP_BUILD_INFO.releaseDate} />
        </div>
        <div className="settingsActions">
          <button type="button" className="button buttonDanger" onClick={onLogOut} disabled={!connection || busy || !serverActionsAvailable}>
            {state.phase === "logging_out" ? "Signing out..." : "Sign out"}
          </button>
        </div>
        {connection ? (
          <div className="settingsLocalFallback">
            <span className="muted">
              If Second Pass Library can't be reached, sign out locally. This removes the connection and its offline
              data from this browser.
            </span>
            <button
              type="button"
              className="settingsLinkButton"
              onClick={onSignOutLocally}
              disabled={busy}
            >
              {state.phase === "signing_out_locally" ? `Removing${"\u2026"}` : "Sign out locally"}
            </button>
            <span className="muted">Forget this connection without contacting Second Pass Library. Its offline data will be removed.</span>
            <button
              type="button"
              className="settingsLinkButton"
              onClick={onForgetLocally}
              disabled={busy}
            >
              {state.phase === "forgetting" ? `Removing${"\u2026"}` : "Forget connection and local data"}
            </button>
          </div>
        ) : null}
      </section>

      {state.phase === "success" ? <p className="settingsNotice">{state.message}</p> : null}
      {state.phase === "error" ? (
        <div className="settingsNotice">
          <p className="errorText">{state.message}</p>
          {state.technicalDetail ? <p className="muted mono">{state.technicalDetail}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function formatUser(connection: ActiveConnection): string {
  const user = connection.verifiedUser;
  if (!user) return "Unknown";
  const first = typeof user.firstName === "string" ? user.firstName.trim() : "";
  const last = typeof user.lastName === "string" ? user.lastName.trim() : "";
  const display = typeof user.displayName === "string" ? user.displayName.trim() : "";
  const username = typeof user.username === "string" ? user.username.trim() : "";
  const name = first && last ? `${first} ${last}` : display;
  if (name && username) return `<${name}>@${username}`;
  if (name) return `<${name}>`;
  if (username) return `@${username}`;
  return "Unknown";
}

function formatTimestamp(value?: string): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
