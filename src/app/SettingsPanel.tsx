import { useState } from "react";
import type { ConnectionProfile } from "../storage/connectionProfiles";
import { saveConnectionProfile } from "../storage/connectionProfiles";
import type { AppTheme } from "../storage/appTheme";
import { getConnectionStatus, getConnectionStatusLabel } from "../features/connection/connectionStatus";
import { discoverSecondPass } from "../features/connection/connectionUtils";
import { applyCurrentAccountToProfile } from "../features/connection/accountProfile";
import { createSplClientFromProfile } from "./createSplClient";
import type { AppWorkflowStep } from "./appWorkflow";
import { navigateTo } from "./navigation";

type Props = {
  profile: ConnectionProfile | null;
  onProfilesChanged: () => void;
  onForgetServer: () => void;
  appTheme: AppTheme;
  onAppThemeChange: (theme: AppTheme) => void;
  workflowStep: AppWorkflowStep;
};

type ActionState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "logging_out" }
  | { phase: "success"; message: string }
  | { phase: "error"; message: string; action: "check" | "logout" };

export function SettingsPanel({
  profile,
  onProfilesChanged,
  onForgetServer,
  appTheme,
  onAppThemeChange,
  workflowStep,
}: Props) {
  const [state, setState] = useState<ActionState>({ phase: "idle" });

  async function checkConnection() {
    if (!profile) return;
    if (!profile.accessToken) {
      setState({ phase: "error", action: "check", message: "This library is not linked yet." });
      return;
    }

    setState({ phase: "checking" });
    try {
      const discovery = await discoverSecondPass(profile.serverBaseUrl);
      const now = new Date().toISOString();
      const discoveredProfile: ConnectionProfile = {
        ...profile,
        serverName: discovery.server_name,
        serverDescription: discovery.server_description,
        apiBaseUrl: discovery.api_base_url,
        clientApi: {
          discoveryVersion: discovery.client_api.discovery_version,
          discoveryEndpoint: discovery.client_api.discovery_endpoint,
          loginRequestEndpoint: discovery.client_api.login_request_endpoint,
          authorizeUrl: discovery.client_api.authorize_url,
          pollEndpointTemplate: discovery.client_api.poll_endpoint_template,
        },
        lastCheckedAt: now,
      };

      const me = await createSplClientFromProfile(discoveredProfile).account.getCurrent();
      saveConnectionProfile(applyCurrentAccountToProfile(discoveredProfile, me, now));
      onProfilesChanged();
      setState({ phase: "success", message: "Connection checked successfully." });
    } catch (e) {
      setState({
        phase: "error",
        action: "check",
        message: e instanceof Error ? e.message : "Connection check failed.",
      });
    }
  }

  async function logOut() {
    if (!profile?.apiBaseUrl || !profile.accessToken || !profile.clientSessionId) {
      setState({
        phase: "error",
        action: "logout",
        message: "This library is missing the session details needed to revoke the server session.",
      });
      return;
    }

    setState({ phase: "logging_out" });
    try {
      const endpoint = new URL(
        `/api/v1/accounts/me/client-sessions/${encodeURIComponent(profile.clientSessionId)}/`,
        profile.apiBaseUrl,
      );
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: {
          Authorization: `${profile.tokenType ?? "Bearer"} ${profile.accessToken}`,
        },
      });
      if (!response.ok) throw new Error(`Logout failed with HTTP ${response.status}.`);
      onForgetServer();
    } catch (e) {
      setState({
        phase: "error",
        action: "logout",
        message: e instanceof Error ? e.message : "Logout failed.",
      });
    }
  }

  function forgetLocally() {
    onForgetServer();
  }

  const status = getConnectionStatus(profile);
  const busy = state.phase === "checking" || state.phase === "logging_out";

  return (
    <div className="settingsLayout">
      <section className="settingsSection">
        <h1 className="settingsTitle">Settings</h1>
      </section>

      <section className="panel settingsCard">
        <div className="settingsSectionHeader">
          <h2 className="panelTitle">Appearance</h2>
        </div>
        <div className="settingsRow">
          <div>
            <div className="settingsLabel">Theme</div>
          </div>
          <div className="segmentedControl" role="radiogroup" aria-label="Theme">
            {(["system", "light", "dark"] as AppTheme[]).map((theme) => (
              <button
                key={theme}
                type="button"
                className={`segmentedButton${appTheme === theme ? " segmentedButtonActive" : ""}`}
                role="radio"
                aria-checked={appTheme === theme}
                onClick={() => onAppThemeChange(theme)}
              >
                {theme[0].toUpperCase() + theme.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="panel settingsCard">
        <div className="settingsSectionHeader">
          <h2 className="panelTitle">Connected library</h2>
          <span className={`pill ${status === "verified" ? "pillOk" : status === "not_configured" ? "pillIdle" : "pillWarn"}`}>
            {getConnectionStatusLabel(status)}
          </span>
        </div>

        {!profile ? (
          <div className="settingsEmpty">
            <p className="muted">No library is connected in this browser.</p>
            <button type="button" className="button buttonPrimary" onClick={() => navigateTo({ kind: "connect" })}>
              Connect library
            </button>
          </div>
        ) : (
          <>
            <div className="settingsGrid">
              <Detail label="Library" value={profile.serverName ?? profile.label} />
              {profile.serverDescription ? <Detail label="Description" value={profile.serverDescription} /> : null}
              <Detail label="Server URL" value={profile.serverBaseUrl} mono />
              <Detail label="Signed-in user" value={formatUser(profile)} />
              <Detail label="Client session" value={profile.clientSessionName ?? "Unknown"} />
              <Detail label="Last checked" value={formatTimestamp(profile.lastCheckedAt ?? profile.verifiedAt)} />
            </div>
            <div className="settingsActions">
              <button type="button" className="button" onClick={() => void checkConnection()} disabled={busy}>
                {state.phase === "checking" ? `Checking${"\u2026"}` : "Check connection"}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="panel settingsCard">
        <div className="settingsSectionHeader">
          <h2 className="panelTitle">Session</h2>
        </div>
        <p className="muted">
          Log out revokes this client session on the server and removes the local connection from this browser. Server
          books and annotations are not deleted.
        </p>
        <div className="settingsActions">
          <button type="button" className="button buttonDanger" onClick={() => void logOut()} disabled={!profile || busy}>
            {state.phase === "logging_out" ? `Logging out${"\u2026"}` : "Log out"}
          </button>
        </div>
        {profile ? (
          <div className="settingsLocalFallback">
            <span className="muted">If logout fails, you can forget this connection locally.</span>
            <button
              type="button"
              className="settingsLinkButton"
              onClick={forgetLocally}
              disabled={state.phase === "logging_out"}
            >
              Forget locally
            </button>
          </div>
        ) : null}
      </section>

      {state.phase === "success" ? <p className="settingsNotice">{state.message}</p> : null}
      {state.phase === "error" ? <p className="errorText">{state.message}</p> : null}

      <details className="panel settingsDiagnostics">
        <summary className="panelTitle">Diagnostics</summary>
        <div className="settingsGrid settingsDiagnosticsBody">
          <Detail label="Current workflow step" value={workflowStep} mono />
          <Detail label="Server URL" value={profile?.serverBaseUrl ?? "None"} mono />
          <Detail label="API base URL" value={profile?.apiBaseUrl ?? "None"} mono />
          <Detail label="Client session id" value={profile?.clientSessionId ?? "None"} mono />
          <Detail label="Token type" value={profile?.accessToken ? profile.tokenType ?? "Bearer" : "None"} mono />
          <Detail label="Linked at" value={profile?.linkedAt ?? "None"} mono />
          <Detail label="Verified at" value={profile?.verifiedAt ?? "None"} mono />
          <Detail label="Last checked at" value={profile?.lastCheckedAt ?? "None"} mono />
          <Detail label="Discovery endpoint" value={profile?.clientApi?.discoveryEndpoint ?? "None"} mono />
          <Detail label="Login request endpoint" value={profile?.clientApi?.loginRequestEndpoint ?? "None"} mono />
          <Detail label="Authorize URL" value={profile?.clientApi?.authorizeUrl ?? "None"} mono />
          <Detail label="Poll endpoint template" value={profile?.clientApi?.pollEndpointTemplate ?? "None"} mono />
          <Detail label="Last error" value={state.phase === "error" ? state.message : "None"} />
        </div>
      </details>
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="detailRow">
      <span className="muted">{label}:</span> <span className={mono ? "mono" : undefined}>{value}</span>
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
