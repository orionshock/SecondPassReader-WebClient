import "./App.css";
import { useEffect, useMemo, useState } from "react";
import { ClientApiLinking, ClientApiVerification, ConnectionSetup } from "../features/connection";
import { getConnectionStatus, getConnectionStatusLabel } from "../features/connection/connectionStatus";
import { LibraryLandingPage } from "../features/library";
import { ReaderArea, type OpenedBook } from "../features/reader";
import { DebugDetails } from "./DebugDetails";
import { getAppWorkflowStep } from "./appWorkflow";
import { getConnectionProfile, listConnectionProfiles } from "../storage/connectionProfiles";

const SELECTED_PROFILE_KEY = "secondpass.selectedConnectionProfileId.v1";

export default function App() {
  const [profilesVersion, setProfilesVersion] = useState(0);
  const [openedBook, setOpenedBook] = useState<OpenedBook | null>(null);
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
  const workflowStep = useMemo(() => getAppWorkflowStep(selectedProfile), [selectedProfile]);

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
        <div>
          <h1 className="appTitle">Second Pass Reader</h1>
          <p className="appSubtitle">Standalone browser reader client</p>
        </div>
        <div className="headerStrip">
          <span className="pill pillOk">client: running</span>
          {connectionStatus === "verified" ? (
            <span className="pill pillOk">server: {getConnectionStatusLabel(connectionStatus)}</span>
          ) : (
            <span className="pill pillWarn">server: {getConnectionStatusLabel(connectionStatus)}</span>
          )}
          <span className="pill pillIdle">renderer: not initialized</span>
        </div>
      </header>

      <main className="appMain">
        <section className="panel workflowPanel">
          <h2 className="panelTitle">Workflow</h2>

          {workflowStep === "connect_server" ? (
            <>
              <p className="muted">Step 1: Connect to a server and run discovery.</p>
              <ConnectionSetup
                selectedProfileId={selectedProfileId}
                onSelectedProfileIdChange={setSelectedProfileId}
                onProfilesChanged={() => setProfilesVersion((v) => v + 1)}
                profilesVersion={profilesVersion}
                showSelectedProfilePanel={false}
              />
            </>
          ) : null}

          {workflowStep === "pair_device" ? (
            <>
              <p className="muted">Step 2: Pair this device to your server.</p>
              <ServerSummary profile={selectedProfile} />
              <ClientApiLinking
                selectedProfileId={selectedProfileId}
                onProfilesChanged={() => setProfilesVersion((v) => v + 1)}
                profilesVersion={profilesVersion}
              />
            </>
          ) : null}

          {workflowStep === "verify_connection" ? (
            <>
              <p className="muted">Step 3: Verify the linked token.</p>
              <ServerSummary profile={selectedProfile} />
              <ClientApiVerification
                selectedProfileId={selectedProfileId}
                profilesVersion={profilesVersion}
                onProfilesChanged={() => setProfilesVersion((v) => v + 1)}
                autoVerify
              />
            </>
          ) : null}

          {workflowStep === "library_home" ? (
            <div className="homeGrid">
              <section className="panel">
                <h2 className="panelTitle">Server status</h2>
                <ServerSummary profile={selectedProfile} />
              </section>

              <LibraryLandingPage
                profile={selectedProfile}
                onBookOpened={(opened) => {
                  setOpenedBook((prev) => {
                    if (prev) URL.revokeObjectURL(prev.objectUrl);
                    return opened;
                  });
                }}
              />

              <section className="panel">
                <h2 className="panelTitle">Reader area</h2>
                <ReaderArea
                  openedBook={openedBook}
                  onClose={() => {
                    setOpenedBook((prev) => {
                      if (prev) URL.revokeObjectURL(prev.objectUrl);
                      return null;
                    });
                  }}
                />
              </section>

              <section className="panel">
                <h2 className="panelTitle">Session controls</h2>
                <p className="muted">Reading sessions not implemented yet.</p>
              </section>

              <section className="panel">
                <h2 className="panelTitle">Annotation controls</h2>
                <p className="muted">Annotations not implemented yet.</p>
              </section>
            </div>
          ) : null}
        </section>

        <DebugDetails step={workflowStep} selectedProfileId={selectedProfileId} profile={selectedProfile} />
      </main>
    </div>
  );
}

function ServerSummary({ profile }: { profile: ReturnType<typeof getConnectionProfile> | null }) {
  if (!profile) return <p className="muted">No profile selected.</p>;
  return (
    <div className="serverSummary">
      <div className="detailRow">
        <span className="muted">Profile:</span> {profile.label}
      </div>
      <div className="detailRow">
        <span className="muted">Server:</span> <span className="mono">{profile.serverBaseUrl}</span>
      </div>
      {profile.serverName ? (
        <div className="detailRow">
          <span className="muted">Name:</span> {profile.serverName}
        </div>
      ) : null}
      {profile.apiBaseUrl ? (
        <div className="detailRow">
          <span className="muted">API base:</span> <span className="mono">{profile.apiBaseUrl}</span>
        </div>
      ) : null}
    </div>
  );
}
