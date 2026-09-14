import "./App.css";
import { lazy, Suspense, useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { ClientApiLinking } from "../features/connection/ClientApiLinkingPanel.UI";
import { ClientApiVerification } from "../features/connection/ClientApiVerificationPanel.UI";
import { ConnectServerScreen } from "../features/connection/ConnectServerPage.UI";
import { getAppWorkflowStep } from "./AppWorkflow.Policy";
import { navigateTo } from "./AppNavigation.Router";
import {
  clearActiveConnection,
  getActiveConnection,
  saveConnectionProfile,
  type ConnectionProfile,
} from "../storage/ConnectionProfiles.Store";
import { AppHeader } from "./AppHeader.UI";
import { createSplClientFromProfile } from "./AppSplClient.Factory";
import type { SecondPassClient } from "@secondpass/client";
import { ConnectionRecoveryProvider, useConnectionRecovery } from "./ConnectionRecovery.Context";
import { ConnectionRecoveryBannerForState } from "./ConnectionRecoveryBanner.UI";
import { ServerRichText } from "../components/ServerRichText.Renderer";
import { AppBookDetailModalController } from "./routes/AppBookDetailModal.Controller";
import { AppLibraryRouteRenderer } from "./routes/AppLibraryRoute.Orchestrator";
import { useAppAuthenticatedContextController } from "./AppAuthenticatedContext.Controller";
import { useAppReaderOpenController } from "./AppReaderOpen.Controller";
import { useAppThemeLifecycle } from "./AppTheme.Lifecycle";
import { OfflineReaderSyncNoticePanel } from "./offline/reader/sync/notice/OfflineReaderSyncNoticePanel.UI";
import { markConnectionRepairRequired } from "../features/connection/ConnectionRepair.State";
import { removeConnectionAndOfflineData } from "../features/connection/ConnectionRemoval.Controller";
import {
  getBrowserConnectivitySnapshot,
  subscribeToBrowserConnectivity,
} from "./connectivity/BrowserConnectivity.State";
import { useAppRouteWorkflowLifecycle } from "./AppRouteWorkflow.Lifecycle";
import { useAppPagePresentationLifecycle } from "./AppPagePresentation.Lifecycle";
import { useAppAuthenticatedOfflineSyncLifecycle } from "./AppAuthenticatedOfflineSync.Lifecycle";
import { useAppConnectionRecoveryLifecycle } from "./AppConnectionRecovery.Lifecycle";

const SettingsPanel = lazy(async () => {
  const module = await import("./SettingsPanel.UI");
  return { default: module.SettingsPanel };
});

// Root composition for connection workflow, route gating, and global sync lifecycles.
// Feature owners remain below this boundary.
function AppShell() {
  const [profilesVersion, setProfilesVersion] = useState(0);
  const {
    authenticationRepairRequired,
    authorizationFailure,
    clearAuthorizationFailure,
    reportAuthorizationFailure,
    requireAuthenticationRepair,
  } = useConnectionRecovery();

  const selectedProfile = useMemo(() => {
    void profilesVersion;
    return getActiveConnection();
  }, [profilesVersion]);
  const selectedProfileId = selectedProfile?.id ?? null;
  const refreshProfiles = useCallback(() => {
    setProfilesVersion((version) => version + 1);
  }, []);

  const splClient: SecondPassClient | null = useMemo(() => {
    if (selectedProfile?.authenticationState === "repair-required") return null;
    if (!selectedProfile?.apiBaseUrl || !selectedProfile?.accessToken) return null;
    return createSplClientFromProfile(selectedProfile);
  }, [selectedProfile?.apiBaseUrl, selectedProfile?.accessToken, selectedProfile?.authenticationState, selectedProfile?.tokenType]);

  const workflowStep = useMemo(() => getAppWorkflowStep(selectedProfile), [selectedProfile]);
  const route = useAppRouteWorkflowLifecycle(workflowStep);
  const browserConnectivity = useSyncExternalStore(
    subscribeToBrowserConnectivity,
    getBrowserConnectivitySnapshot,
    (): "unknown" => "unknown",
  );

  const { appTheme, setAppTheme } = useAppThemeLifecycle();

  useAppConnectionRecoveryLifecycle({
    route,
    profile: selectedProfile,
    authenticationRepairRequired,
    clearAuthorizationFailure,
    onProfileChanged: refreshProfiles,
  });

  useAppAuthenticatedContextController({
    workflowStep,
    profile: selectedProfile,
    spl: splClient,
    clearAuthorizationFailure,
    reportAuthorizationFailure,
    onProfileChanged: refreshProfiles,
  });

  const { verifiedOfflineNamespaceKey, offlineNamespaceKey } = useAppAuthenticatedOfflineSyncLifecycle({
    workflowStep,
    profile: selectedProfile,
    spl: splClient,
    requireAuthenticationRepair,
  });

  const {
    openedBook,
    readerRestoreError,
    closeReader,
    openReaderFromBookDetail,
    retryReaderRestore,
  } = useAppReaderOpenController({
    route,
    workflowStep,
    profile: selectedProfile,
    spl: splClient,
    reportAuthorizationFailure,
  });
  const { view, mainRef } = useAppPagePresentationLifecycle({
    route,
    workflowStep,
    readerBookTitle: openedBook?.book?.title,
  });

  function handleConnectionChanged() {
    clearAuthorizationFailure();
    refreshProfiles();
  }

  function returnToConnect(options?: { replace?: boolean }) {
    clearAuthorizationFailure();
    clearActiveConnection();
    closeReader();
    refreshProfiles();
    navigateTo({ kind: "connect" }, options);
  }

  function handleDisconnect() {
    returnToConnect();
  }

  function handleRepairConnection() {
    if (!selectedProfile) return;
    saveConnectionProfile(markConnectionRepairRequired(selectedProfile));
    refreshProfiles();
    navigateTo({ kind: "pair" });
  }

  async function handleCancelPairing(): Promise<"completed" | "cancelled" | "failed"> {
    if (selectedProfile?.authenticationState !== "repair-required") {
      returnToConnect({ replace: true });
      return "completed";
    }

    const result = await removeConnectionAndOfflineData({
      intent: "sign-out",
      namespaceKey: verifiedOfflineNamespaceKey,
      client: null,
      connectivity: browserConnectivity,
      confirm: (message) => window.confirm(message),
      onRemoved: () => returnToConnect({ replace: true }),
    });
    return result.status === "removed" ? "completed" : result.status;
  }

  return (
    <div className={`appShell ${openedBook && route?.kind === "reader" ? "appShellReader" : ""}`}>
      {openedBook && route?.kind === "reader" ? null : (
        <AppHeader
          profile={selectedProfile}
          view={view}
          route={route}
          canNavigate={workflowStep === "library_home"}
          connectivity={browserConnectivity}
          onShowHome={() => {
            navigateTo({ kind: "home" });
            closeReader();
          }}
          onShowLibrary={() => {
            navigateTo({ kind: "library" });
            closeReader();
          }}
          onShowSessions={() => {
            navigateTo({ kind: "sessions" });
            closeReader();
          }}
          onShowShelves={() => {
            navigateTo({ kind: "shelves" });
            closeReader();
          }}
          onShowSettings={() => {
            navigateTo({ kind: "settings", tab: "appearance" });
            closeReader();
          }}
        />
      )}

      <ConnectionRecoveryBannerForState
        authorizationFailure={authorizationFailure}
        authenticationRepairRequired={authenticationRepairRequired}
        hasConnection={Boolean(selectedProfile)}
        route={route}
      />

      {workflowStep === "library_home" ? <OfflineReaderSyncNoticePanel /> : null}

      <main ref={mainRef} className="appMain" tabIndex={-1}>
        {view === "settings" ? (
          <Suspense
            fallback={(
              <div className="settingsLayout">
                <section className="settingsSection">
                  <h1 className="settingsTitle">Settings</h1>
                  <p className="muted">{`Loading settings${"\u2026"}`}</p>
                </section>
              </div>
            )}
          >
            <SettingsPanel
              profile={selectedProfile}
              onProfilesChanged={handleConnectionChanged}
              onDisconnect={handleDisconnect}
              onRepairConnection={handleRepairConnection}
              appTheme={appTheme}
              onAppThemeChange={setAppTheme}
              route={route?.kind === "settings" ? route : { kind: "settings" }}
              offlineNamespaceKey={offlineNamespaceKey}
              client={splClient}
              connectivity={browserConnectivity}
            />
          </Suspense>
        ) : (
          <>
            {workflowStep === "connect_server" ? (
              <ConnectServerScreen
                selectedProfileId={selectedProfileId}
                onSelectedProfileIdChange={() => undefined}
                onProfilesChanged={handleConnectionChanged}
              />
            ) : null}

            {workflowStep === "pair_device" ? (
              <ClientApiLinking
                selectedProfileId={selectedProfileId}
                onProfilesChanged={handleConnectionChanged}
                profilesVersion={profilesVersion}
                onCancel={handleCancelPairing}
              />
            ) : null}

            {workflowStep === "verify_connection" ? (
              <section className="panel workflowPanel">
                <h1 className="panelTitle">Verify connection</h1>
                <ServerSummary profile={selectedProfile} />
                <ClientApiVerification
                  selectedProfileId={selectedProfileId}
                  profilesVersion={profilesVersion}
                  onProfilesChanged={handleConnectionChanged}
                  autoVerify
                />
              </section>
            ) : null}

            {workflowStep === "library_home" ? (
              <AppLibraryRouteRenderer
                route={route}
                profile={selectedProfile}
                spl={splClient}
                connectivity={browserConnectivity}
                offlineNamespaceKey={offlineNamespaceKey}
                openedBook={openedBook}
                readerRestoreError={readerRestoreError}
                onCloseReader={closeReader}
                onRetryReaderRestore={retryReaderRestore}
              />
            ) : null}
          </>
        )}
      </main>

      {workflowStep === "library_home" && route?.kind !== "reader" ? (
        <AppBookDetailModalController
          route={route}
          profile={selectedProfile}
          spl={splClient}
          connectivity={browserConnectivity}
          offlineNamespaceKey={offlineNamespaceKey}
          onOpenReader={openReaderFromBookDetail}
        />
      ) : null}
    </div>
  );
}

function ServerSummary({ profile }: { profile: ConnectionProfile | null }) {
  if (!profile) return <p className="muted">No library connected.</p>;
  return (
    <div className="serverSummary">
      <div className="detailRow">
        <span className="muted">Library:</span> {profile.serverName ?? profile.label}
      </div>
      <div className="detailRow">
        <span className="muted">Server URL:</span> <span className="mono">{profile.serverBaseUrl}</span>
      </div>
      {profile.serverName ? (
        <div className="detailRow">
          <span className="muted">Name:</span> {profile.serverName}
        </div>
      ) : null}
      {profile.serverDescription ? (
        <div className="detailRow">
          <span className="muted">Description:</span>
          <ServerRichText value={profile.serverDescription} />
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

export default function App() {
  return (
    <ConnectionRecoveryProvider>
      <AppShell />
    </ConnectionRecoveryProvider>
  );
}
