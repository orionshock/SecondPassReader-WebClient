import { ConnectionSetup } from "../features/connection";
import type { ConnectionProfile } from "../storage/connectionProfiles";
import { getConnectionStatus, getConnectionStatusLabel } from "../features/connection/connectionStatus";

export function SettingsPanel({
  profile,
  selectedProfileId,
  onSelectedProfileIdChange,
  onProfilesChanged,
  profilesVersion,
  onForgetServer,
}: {
  profile: ConnectionProfile | null;
  selectedProfileId: string | null;
  onSelectedProfileIdChange: (id: string | null) => void;
  onProfilesChanged: () => void;
  profilesVersion: number;
  onForgetServer: () => void;
}) {
  return (
    <div className="settingsLayout">
      <section className="panel">
        <h2 className="panelTitle">Current server</h2>
        {!profile ? (
          <p className="muted">No profile selected.</p>
        ) : (
          <div className="settingsGrid">
            <div className="detailRow">
              <span className="muted">Label:</span> {profile.label}
            </div>
            <div className="detailRow">
              <span className="muted">Server:</span> <span className="mono">{profile.serverBaseUrl}</span>
            </div>
            {profile.serverName ? (
              <div className="detailRow">
                <span className="muted">Name:</span> {profile.serverName}
              </div>
            ) : null}
            {profile.serverDescription ? (
              <div className="detailRow">
                <span className="muted">Description:</span> {profile.serverDescription}
              </div>
            ) : null}
            {profile.apiBaseUrl ? (
              <div className="detailRow">
                <span className="muted">API base:</span> <span className="mono">{profile.apiBaseUrl}</span>
              </div>
            ) : null}
            <div className="detailRow">
              <span className="muted">Status:</span> {getConnectionStatusLabel(getConnectionStatus(profile))}
            </div>
            {profile.linkedAt ? (
              <div className="detailRow">
                <span className="muted">Linked at:</span> {profile.linkedAt}
              </div>
            ) : null}
            {profile.clientSessionId ? (
              <div className="detailRow">
                <span className="muted">Client session:</span> <span className="mono">{profile.clientSessionId}</span>
              </div>
            ) : null}
            {profile.verifiedUser ? (
              <div className="detailRow">
                <span className="muted">Verified user:</span> <span className="mono">{profile.verifiedUser.username}</span>
              </div>
            ) : null}
            {profile.verifiedAt ? (
              <div className="detailRow">
                <span className="muted">Verified at:</span> {profile.verifiedAt}
              </div>
            ) : null}

            <div className="settingsActions">
              <button type="button" className="button buttonDanger" onClick={onForgetServer} disabled={!selectedProfileId}>
                Forget this server
              </button>
              <div className="muted settingsHint">Deletes the selected profile from this browser only.</div>
            </div>
          </div>
        )}
      </section>

      <details className="panel settingsAdvanced">
        <summary className="panelTitle">Advanced profile tools</summary>
        <div className="settingsAdvancedBody">
          <ConnectionSetup
            selectedProfileId={selectedProfileId}
            onSelectedProfileIdChange={onSelectedProfileIdChange}
            onProfilesChanged={onProfilesChanged}
            profilesVersion={profilesVersion}
            showSelectedProfilePanel
          />
        </div>
      </details>
    </div>
  );
}
