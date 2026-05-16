import "./App.css";
import { useEffect, useMemo, useState } from "react";
import { ClientApiLinking, ClientApiVerification, ConnectionSetup } from "../features/connection";
import { getConnectionStatus, getConnectionStatusLabel } from "../features/connection/connectionStatus";
import { LibraryLandingPage } from "../features/library";
import { getConnectionProfile, listConnectionProfiles } from "../storage/connectionProfiles";

const SELECTED_PROFILE_KEY = "secondpass.selectedConnectionProfileId.v1";

export default function App() {
  const [profilesVersion, setProfilesVersion] = useState(0);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SELECTED_PROFILE_KEY);
    } catch {
      return null;
    }
  });

  const selectedProfile = useMemo(() => {
    if (!selectedProfileId) return null;
    return getConnectionProfile(selectedProfileId) ?? null;
  }, [selectedProfileId, profilesVersion]);

  const connectionStatus = useMemo(() => getConnectionStatus(selectedProfile), [selectedProfile]);

  useEffect(() => {
    const profiles = listConnectionProfiles();
    if (selectedProfileId && profiles.some((p) => p.id === selectedProfileId)) return;
    if (profiles.length === 0) {
      setSelectedProfileId(null);
      return;
    }
    setSelectedProfileId(profiles[0].id);
  }, []);

  useEffect(() => {
    try {
      if (selectedProfileId) localStorage.setItem(SELECTED_PROFILE_KEY, selectedProfileId);
      else localStorage.removeItem(SELECTED_PROFILE_KEY);
    } catch {
      // ignore storage errors
    }
  }, [selectedProfileId]);

  return (
    <div className="appShell">
      <header className="appHeader">
        <h1 className="appTitle">Second Pass Reader</h1>
        <p className="appSubtitle">Standalone browser reader client</p>
      </header>

      <main className="appMain">
        <section className="panel">
          <h2 className="panelTitle">Status</h2>
          <dl className="statusList">
            <div className="statusRow">
              <dt>Client app</dt>
              <dd>
                <span className="pill pillOk">running</span>
              </dd>
            </div>
            <div className="statusRow">
              <dt>Server connection</dt>
              <dd>
                {connectionStatus === "verified" ? (
                  <span className="pill pillOk">{getConnectionStatusLabel(connectionStatus)}</span>
                ) : (
                  <span className="pill pillWarn">{getConnectionStatusLabel(connectionStatus)}</span>
                )}
              </dd>
            </div>
            <div className="statusRow">
              <dt>Renderer</dt>
              <dd>
                <span className="pill pillIdle">not initialized</span>
              </dd>
            </div>
          </dl>
        </section>

        <ConnectionSetup
          selectedProfileId={selectedProfileId}
          onSelectedProfileIdChange={setSelectedProfileId}
          onProfilesChanged={() => setProfilesVersion((v) => v + 1)}
          profilesVersion={profilesVersion}
        />

        <ClientApiLinking
          selectedProfileId={selectedProfileId}
          onProfilesChanged={() => setProfilesVersion((v) => v + 1)}
          profilesVersion={profilesVersion}
        />

        <ClientApiVerification
          selectedProfileId={selectedProfileId}
          profilesVersion={profilesVersion}
          onProfilesChanged={() => setProfilesVersion((v) => v + 1)}
        />

        <LibraryLandingPage profile={selectedProfile} />
      </main>
    </div>
  );
}
