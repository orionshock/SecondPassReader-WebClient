import "./App.css";
import { useEffect, useMemo, useState } from "react";
import { ClientApiLinking, ClientApiVerification, ConnectServerScreen } from "../features/connection";
import { LibraryLandingPage } from "../features/library";
import { ReaderArea, type OpenedBook } from "../features/reader";
import { DebugDetails } from "./DebugDetails";
import { getAppWorkflowStep } from "./appWorkflow";
import type { LibraryBook } from "../schemas/library";
import {
  deleteConnectionProfile,
  getConnectionProfile,
  listConnectionProfiles,
} from "../storage/connectionProfiles";
import { AppHeader } from "./AppHeader";
import { SettingsPanel } from "./SettingsPanel";
import { openBookForReader } from "../features/library/openBookForReader";

const SELECTED_PROFILE_KEY = "secondpass.selectedConnectionProfileId.v1";

export default function App() {
  const [profilesVersion, setProfilesVersion] = useState(0);
  const [openedBook, setOpenedBook] = useState<OpenedBook | null>(null);
  const [view, setView] = useState<"main" | "settings">("main");
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

  function refreshProfiles() {
    setProfilesVersion((v) => v + 1);
  }

  function handleBookOpened(opened: OpenedBook) {
    setOpenedBook((prev) => {
      if (prev) URL.revokeObjectURL(prev.objectUrl);
      return opened;
    });
  }

  async function handleOpenBookFromReader(book: LibraryBook) {
    if (!selectedProfile) throw new Error("No profile selected.");
    const opened = await openBookForReader({ profile: selectedProfile, book });
    handleBookOpened(opened);
  }

  function handleCloseReader() {
    setOpenedBook((prev) => {
      if (prev) URL.revokeObjectURL(prev.objectUrl);
      return null;
    });
  }

  function handleForgetServer() {
    if (!selectedProfileId) return;
    deleteConnectionProfile(selectedProfileId);
    setSelectedProfileId(null);
    handleCloseReader();
    refreshProfiles();
    setView("main");
  }

  return (
    <div className={`appShell ${openedBook ? "appShellReader" : ""}`}>
      {openedBook ? null : (
        <AppHeader
          profile={selectedProfile}
          view={view}
          readerOpen={Boolean(openedBook)}
          onShowLibrary={() => {
            setView("main");
            handleCloseReader();
          }}
          onBackToLibrary={() => handleCloseReader()}
          onShowSettings={() => setView((v) => (v === "settings" ? "main" : "settings"))}
        />
      )}

      <main className="appMain">
        {view === "settings" ? (
          <>
            <SettingsPanel
              profile={selectedProfile}
              selectedProfileId={selectedProfileId}
              onSelectedProfileIdChange={setSelectedProfileId}
              onProfilesChanged={refreshProfiles}
              profilesVersion={profilesVersion}
              onForgetServer={handleForgetServer}
            />
            <DebugDetails step={workflowStep} selectedProfileId={selectedProfileId} profile={selectedProfile} />
          </>
        ) : (
          <>
            {workflowStep === "connect_server" ? (
              <ConnectServerScreen
                selectedProfileId={selectedProfileId}
                onSelectedProfileIdChange={setSelectedProfileId}
                onProfilesChanged={refreshProfiles}
              />
            ) : null}

            {workflowStep === "pair_device" ? (
              <section className="panel workflowPanel">
                <h2 className="panelTitle">Pair this device</h2>
                <ServerSummary profile={selectedProfile} />
                <ClientApiLinking
                  selectedProfileId={selectedProfileId}
                  onProfilesChanged={refreshProfiles}
                  profilesVersion={profilesVersion}
                />
              </section>
            ) : null}

            {workflowStep === "verify_connection" ? (
              <section className="panel workflowPanel">
                <h2 className="panelTitle">Verify connection</h2>
                <ServerSummary profile={selectedProfile} />
                <ClientApiVerification
                  selectedProfileId={selectedProfileId}
                  profilesVersion={profilesVersion}
                  onProfilesChanged={refreshProfiles}
                  autoVerify
                />
              </section>
            ) : null}

            {workflowStep === "library_home" ? (
              openedBook ? (
                <section className="readerScreen">
                  <ReaderArea
                    openedBook={openedBook}
                    onBackToLibrary={handleCloseReader}
                    apiBaseUrl={selectedProfile?.apiBaseUrl}
                    accessToken={selectedProfile?.accessToken}
                    tokenType={selectedProfile?.tokenType}
                    onOpenBook={handleOpenBookFromReader}
                  />
                </section>
              ) : (
                <div className="libraryScreen">
                  <LibraryLandingPage profile={selectedProfile} onBookOpened={handleBookOpened} />
                </div>
              )
            ) : null}
          </>
        )}
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
    </div>
  );
}
