import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { getConnectionStatus, getConnectionStatusLabel } from "../../features/connection/connectionStatus";
import { SettingsDetailRow } from "./SettingsDetail.Row";

export type SettingsLibraryServerActionState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "logging_out" }
  | { phase: "success"; message: string }
  | { phase: "error"; message: string; action: "check" | "logout"; technicalDetail?: string | null };

export function SettingsLibraryServerPanel({
  profile,
  state,
  busy,
  onConnect,
  onCheckConnection,
  onLogOut,
  onForgetLocally,
}: {
  profile: ConnectionProfile | null;
  state: SettingsLibraryServerActionState;
  busy: boolean;
  onConnect: () => void;
  onCheckConnection: () => void;
  onLogOut: () => void;
  onForgetLocally: () => void;
}) {
  const status = getConnectionStatus(profile);

  return (
    <div className="settingsTabPanel" role="tabpanel" aria-label="Library Server settings">
      <section className="panel settingsCard">
        <div className="settingsSectionHeader">
          <h2 className="panelTitle">Connected Library</h2>
          <span className={`pill ${status === "verified" ? "pillOk" : status === "not_configured" ? "pillIdle" : "pillWarn"}`}>
            {getConnectionStatusLabel(status)}
          </span>
        </div>

        {!profile ? (
          <div className="settingsEmpty">
            <p className="muted">No library is connected in this browser.</p>
            <button type="button" className="button buttonPrimary" onClick={onConnect}>
              Connect library
            </button>
          </div>
        ) : (
          <>
            <div className="settingsGrid">
              <SettingsDetailRow label="Library" value={profile.serverName ?? profile.label} />
              {profile.serverDescription ? <SettingsDetailRow label="Description" value={profile.serverDescription} /> : null}
              <SettingsDetailRow label="Server URL" value={profile.serverBaseUrl} mono />
              <SettingsDetailRow label="Signed-in user" value={formatUser(profile)} />
              <SettingsDetailRow label="This device" value={profile.clientSessionName ?? "Unknown"} />
              <SettingsDetailRow label="Last checked" value={formatTimestamp(profile.lastCheckedAt ?? profile.verifiedAt)} />
            </div>
            <div className="settingsActions">
              <button type="button" className="button" onClick={onCheckConnection} disabled={busy}>
                {state.phase === "checking" ? `Checking${"\u2026"}` : "Check connection"}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="panel settingsCard">
        <div className="settingsSectionHeader">
          <h2 className="panelTitle">This Device</h2>
        </div>
        <p className="muted">
          Log out revokes this device session on the server and removes the local connection from this browser. Server
          books and annotations are not deleted.
        </p>
        <div className="settingsActions">
          <button type="button" className="button buttonDanger" onClick={onLogOut} disabled={!profile || busy}>
            {state.phase === "logging_out" ? `Logging out${"\u2026"}` : "Log out"}
          </button>
        </div>
        {profile ? (
          <div className="settingsLocalFallback">
            <span className="muted">If logout fails, you can forget this connection locally.</span>
            <button
              type="button"
              className="settingsLinkButton"
              onClick={onForgetLocally}
              disabled={state.phase === "logging_out"}
            >
              Forget locally
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

function formatUser(profile: ConnectionProfile): string {
  const user = profile.verifiedUser;
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
