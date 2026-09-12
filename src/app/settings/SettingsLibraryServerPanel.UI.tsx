import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";
import { APP_BUILD_INFO } from "../AppBuildInfo.Constants";
import { ServerRichText } from "../../components/ServerRichText.Renderer";
import { getConnectionStatus, getConnectionStatusLabel } from "../../features/connection/ConnectionStatus.Presenter";
import { SettingsDetailRow } from "./SettingsDetailRow.UI";

export type SettingsLibraryServerActionState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "logging_out" }
  | { phase: "forgetting" }
  | { phase: "success"; message: string }
  | { phase: "error"; message: string; action: "check" | "logout" | "forget"; technicalDetail?: string | null };

export function SettingsLibraryServerPanel({
  profile,
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
  profile: ConnectionProfile | null;
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
  const status = getConnectionStatus(profile);

  return (
    <div className="settingsTabPanel">
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
            <button type="button" className="button buttonPrimary" onClick={onConnect} disabled={!serverActionsAvailable}>
              Connect library
            </button>
          </div>
        ) : (
          <>
            <div className="settingsGrid">
              <SettingsDetailRow label="Library" value={profile.serverName ?? profile.label} />
              {profile.serverDescription ? (
                <div className="detailRow">
                  <span className="muted">Description:</span>
                  <ServerRichText value={profile.serverDescription} />
                </div>
              ) : null}
              <SettingsDetailRow label="Server URL" value={profile.serverBaseUrl} mono />
              <SettingsDetailRow label="Signed-in user" value={formatUser(profile)} />
              <SettingsDetailRow label="This device" value={profile.clientSessionName ?? "Unknown"} />
              <SettingsDetailRow label="Last checked" value={formatTimestamp(profile.lastCheckedAt ?? profile.verifiedAt)} />
            </div>
            <div className="settingsActions">
              <button type="button" className="button" onClick={onCheckConnection} disabled={busy || !serverActionsAvailable}>
                {state.phase === "checking" ? `Checking${"\u2026"}` : "Check connection"}
              </button>
              <button type="button" className="button buttonPrimary" onClick={onRepairConnection} disabled={busy || !serverActionsAvailable}>
                Repair connection
              </button>
            </div>
            {!serverActionsAvailable ? <p className="muted">Library server actions are unavailable while offline.</p> : null}
          </>
        )}
      </section>

      <section className="panel settingsCard">
        <div className="settingsSectionHeader">
          <h2 className="panelTitle">This Device</h2>
        </div>
        <p className="muted">
          Log out revokes this device session and removes its saved credentials. Downloaded books and reading changes
          remain on this device for the same verified account.
        </p>
        <div className="settingsGrid">
          <SettingsDetailRow label="Web client version" value={APP_BUILD_INFO.version} mono />
          <SettingsDetailRow label="Web client release date" value={APP_BUILD_INFO.releaseDate} />
        </div>
        <div className="settingsActions">
          <button type="button" className="button buttonDanger" onClick={onLogOut} disabled={!profile || busy || !serverActionsAvailable}>
            {state.phase === "logging_out" ? `Logging out${"\u2026"}` : "Log out"}
          </button>
        </div>
        {profile ? (
          <div className="settingsLocalFallback">
            <span className="muted">Local sign-out keeps downloaded books and reading changes for a later verified sign-in.</span>
            <button
              type="button"
              className="settingsLinkButton"
              onClick={onSignOutLocally}
              disabled={busy}
            >
              Sign out locally
            </button>
            <span className="muted">To erase this account's downloaded books and local reading data, forget it explicitly.</span>
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
