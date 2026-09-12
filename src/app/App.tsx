import "./App.css";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ClientApiLinking } from "../features/connection/ClientApiLinkingPanel.UI";
import { ClientApiVerification } from "../features/connection/ClientApiVerificationPanel.UI";
import { ConnectServerScreen } from "../features/connection/ConnectServerPage.UI";
import { getAppWorkflowStep } from "./AppWorkflow.Policy";
import type { AppRoute } from "./AppNavigation.Router";
import { navigateTo, parseCurrentRoute } from "./AppNavigation.Router";
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
import { debugLog } from "../lib/debug/DebugLogger.Diagnostics";
import { AppBookDetailModalController } from "./routes/AppBookDetailModal.Controller";
import { AppLibraryRouteRenderer } from "./routes/AppLibraryRoute.Orchestrator";
import { useAppAuthenticatedContextController } from "./AppAuthenticatedContext.Controller";
import { useAppReaderOpenController } from "./AppReaderOpen.Controller";
import { useAppThemeLifecycle } from "./AppTheme.Lifecycle";
import { buildOfflineCacheNamespace } from "./offline/namespace/OfflineCacheNamespace.Policy";
import {
  createOfflineReaderAuthenticatedSyncGeneration,
  startOfflineReaderAuthenticatedSyncLifecycle,
} from "./offline/reader/sync/OfflineReaderAuthenticatedSync.Lifecycle";
import { showOfflineReaderSyncOutcome } from "./offline/reader/sync/notice/OfflineReaderSyncNotice.Controller";
import { OfflineReaderSyncNoticePanel } from "./offline/reader/sync/notice/OfflineReaderSyncNoticePanel.UI";
import { clearOfflineReaderSyncNotice } from "./offline/reader/sync/notice/OfflineReaderSyncNotice.State";
import { markConnectionRepairRequired } from "../features/connection/ConnectionRepair.State";
import {
  getBrowserConnectivitySnapshot,
  subscribeToBrowserConnectivity,
} from "./connectivity/BrowserConnectivity.State";

const SettingsPanel = lazy(async () => {
  const module = await import("./SettingsPanel.UI");
  return { default: module.SettingsPanel };
});

function AppShell() {
  const [profilesVersion, setProfilesVersion] = useState(0);
  const [view, setView] = useState<"main" | "settings">("main");
  const [route, setRoute] = useState<AppRoute | null>(() => parseCurrentRoute());
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
  const browserConnectivity = useSyncExternalStore(
    subscribeToBrowserConnectivity,
    getBrowserConnectivitySnapshot,
    (): "unknown" => "unknown",
  );
  const offlineNamespaceKey = useMemo(() => {
    if (workflowStep !== "library_home" || !selectedProfile?.verifiedAt) return null;
    return buildOfflineCacheNamespace({
      serverBaseUrl: selectedProfile.serverBaseUrl,
      accountProfileId: selectedProfile.verifiedUser?.profileId,
    })?.key ?? null;
  }, [selectedProfile?.serverBaseUrl, selectedProfile?.verifiedAt, selectedProfile?.verifiedUser?.profileId, workflowStep]);
  const automaticSyncGenerationKey = offlineNamespaceKey && selectedProfile
    ? JSON.stringify([offlineNamespaceKey, selectedProfile.id, selectedProfile.verifiedAt])
    : null;
  const automaticSyncGeneration = useMemo(
    () => createOfflineReaderAuthenticatedSyncGeneration(),
    [automaticSyncGenerationKey],
  );

  const connectionIdentityRef = useRef(`${selectedProfileId ?? ""}:${selectedProfile?.accessToken ?? ""}`);
  const mainRef = useRef<HTMLElement | null>(null);
  const pageFocusKey = view === "settings"
    ? "settings"
    : `${workflowStep}:${route?.kind ?? ""}:${route?.kind === "reader" ? route.bookId : route?.kind === "session" ? route.sessionId : route?.kind === "shelf" || route?.kind === "shelfEdit" ? route.shelfId : ""}`;
  const previousPageFocusKeyRef = useRef(pageFocusKey);

  useEffect(() => {
    if (previousPageFocusKeyRef.current === pageFocusKey) return;
    previousPageFocusKeyRef.current = pageFocusKey;
    mainRef.current?.focus();
  }, [pageFocusKey]);

  useEffect(() => {
    const nextIdentity = `${selectedProfileId ?? ""}:${selectedProfile?.accessToken ?? ""}`;
    if (connectionIdentityRef.current !== nextIdentity) clearAuthorizationFailure();
    connectionIdentityRef.current = nextIdentity;
  }, [clearAuthorizationFailure, selectedProfile?.accessToken, selectedProfileId]);

  useEffect(() => {
    if (route?.kind === "settings" && route.tab === "library-server") {
      clearAuthorizationFailure();
    }
  }, [clearAuthorizationFailure, route]);

  useEffect(() => {
    if (!authenticationRepairRequired || !selectedProfile) return;
    if (selectedProfile.authenticationState === "repair-required") return;
    saveConnectionProfile(markConnectionRepairRequired(selectedProfile));
    refreshProfiles();
    navigateTo({ kind: "pair" }, { replace: true });
  }, [authenticationRepairRequired, refreshProfiles, selectedProfile]);

  useEffect(() => {
    const handler = () => setRoute(parseCurrentRoute());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const { appTheme, setAppTheme } = useAppThemeLifecycle();

  useEffect(() => {
    debugLog("reader", "route changed", {
      kind: route?.kind ?? null,
      bookId: route?.kind === "reader" ? route.bookId : undefined,
    });
  }, [route]);

  useAppAuthenticatedContextController({
    workflowStep,
    profile: selectedProfile,
    spl: splClient,
    clearAuthorizationFailure,
    reportAuthorizationFailure,
    onProfileChanged: refreshProfiles,
  });

  useEffect(() => {
    clearOfflineReaderSyncNotice();
  }, [automaticSyncGenerationKey]);

  useEffect(() => {
    if (!automaticSyncGenerationKey || !offlineNamespaceKey || !splClient) return;
    return startOfflineReaderAuthenticatedSyncLifecycle({
      namespaceKey: offlineNamespaceKey,
      client: splClient,
      generation: automaticSyncGeneration,
      onSweepCompleted: (result) => {
        showOfflineReaderSyncOutcome(result);
        if (result.outcome.reauthenticateBooks > 0) requireAuthenticationRepair();
      },
    });
  }, [automaticSyncGeneration, automaticSyncGenerationKey, offlineNamespaceKey, requireAuthenticationRepair, splClient]);

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

  useEffect(() => {
    if (route?.kind === "settings") setView("settings");
    else setView("main");
  }, [route?.kind]);

  useEffect(() => {
    // Default route selection when hash is empty.
    if (route) return;
    if (workflowStep === "library_home") navigateTo({ kind: "home" }, { replace: true });
    else navigateTo({ kind: "connect" }, { replace: true });
  }, [route, workflowStep]);

  useEffect(() => {
    // Workflow still wins over invalid routes (never bypass auth/verification).
    if (workflowStep === "connect_server") {
      if (route?.kind !== "connect") navigateTo({ kind: "connect" }, { replace: true });
      return;
    }
    if (workflowStep === "pair_device") {
      if (route?.kind !== "pair") navigateTo({ kind: "pair" }, { replace: true });
      return;
    }
    if (workflowStep === "verify_connection") {
      if (route?.kind !== "verify") navigateTo({ kind: "verify" }, { replace: true });
      return;
    }

    // Verified: allow main app routes. Unknown routes fall back to home.
    if (workflowStep === "library_home") {
      if (!route || route.kind === "unknown") {
        navigateTo({ kind: "home" }, { replace: true });
        return;
      }
      if (route.kind === "connect" || route.kind === "pair" || route.kind === "verify") {
        navigateTo({ kind: "home" }, { replace: true });
      }
    }
  }, [route, workflowStep]);

  useEffect(() => {
    const base = "Second Pass Reader";
    if (!route) {
      document.title = base;
      return;
    }
    switch (route.kind) {
      case "home":
        document.title = `${base} - Home`;
        return;
      case "library":
        document.title = `${base} - Library`;
        return;
      case "shelves":
        document.title = `${base} - Shelves`;
        return;
      case "shelf":
        document.title = `${base} - Shelves`;
        return;
      case "shelfEdit":
        document.title = `${base} - Edit shelf`;
        return;
      case "sessions":
        document.title = `${base} - Reading Sessions`;
        return;
      case "session":
        document.title = `${base} - Reading Sessions`;
        return;
      case "settings":
        document.title = `${base} - Settings`;
        return;
      case "reader":
        document.title = openedBook?.book?.title ? `${base} - ${openedBook.book.title}` : `${base} - Reader`;
        return;
      case "connect":
        document.title = `${base} - Connect`;
        return;
      case "pair":
        document.title = `${base} - Pair`;
        return;
      case "verify":
        document.title = `${base} - Verify`;
        return;
      case "unknown":
        document.title = base;
        return;
    }
  }, [openedBook?.book?.title, route]);

  function handleConnectionChanged() {
    clearAuthorizationFailure();
    refreshProfiles();
  }

  function returnToConnect(options?: { replace?: boolean }) {
    clearAuthorizationFailure();
    clearActiveConnection();
    closeReader();
    refreshProfiles();
    setView("main");
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

  function handleCancelPairing() {
    returnToConnect({ replace: true });
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
              offlineSyncClient={splClient}
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
