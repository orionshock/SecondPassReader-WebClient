import "./App.css";
import { lazy, Suspense, useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { ClientApiLinking } from "../features/connection/ClientApiLinkingPanel.UI";
import { ClientApiVerification } from "../features/connection/ClientApiVerificationPanel.UI";
import { ConnectServerScreen } from "../features/connection/ConnectServerPage.UI";
import { getAppWorkflowStep } from "./AppWorkflow.Policy";
import { navigateTo } from "./AppNavigation.Router";
import {
  beginActiveConnectionPublication,
  clearActiveConnection,
  getActiveConnection,
  publishActiveConnectionResult,
  saveActiveConnection,
  type ActiveConnection,
} from "../storage/ActiveConnection.Store";
import { AppHeader } from "./AppHeader.UI";
import { createSplClientFromConnection } from "./AppSplClient.Factory";
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
  const [connectionVersion, setConnectionVersion] = useState(0);
  const {
    authenticationRepairRequired,
    authorizationFailure,
    clearAuthorizationFailure,
    reportAuthorizationFailure,
    requireAuthenticationRepair,
  } = useConnectionRecovery();

  const activeConnection = useMemo(() => {
    void connectionVersion;
    return getActiveConnection();
  }, [connectionVersion]);
  const refreshActiveConnection = useCallback(() => {
    setConnectionVersion((version) => version + 1);
  }, []);

  const splClient: SecondPassClient | null = useMemo(() => {
    if (activeConnection?.authenticationState === "repair-required") return null;
    if (!activeConnection?.apiBaseUrl || !activeConnection?.accessToken) return null;
    return createSplClientFromConnection(activeConnection);
  }, [activeConnection?.apiBaseUrl, activeConnection?.accessToken, activeConnection?.authenticationState, activeConnection?.tokenType]);

  const workflowStep = useMemo(() => getAppWorkflowStep(activeConnection), [activeConnection]);
  const route = useAppRouteWorkflowLifecycle(workflowStep);
  const browserConnectivity = useSyncExternalStore(
    subscribeToBrowserConnectivity,
    getBrowserConnectivitySnapshot,
    (): "unknown" => "unknown",
  );

  const { appTheme, setAppTheme } = useAppThemeLifecycle();

  useAppConnectionRecoveryLifecycle({
    route,
    connection: activeConnection,
    authenticationRepairRequired,
    clearAuthorizationFailure,
    onConnectionChanged: refreshActiveConnection,
  });

  useAppAuthenticatedContextController({
    workflowStep,
    connection: activeConnection,
    spl: splClient,
    clearAuthorizationFailure,
    reportAuthorizationFailure,
    onConnectionChanged: refreshActiveConnection,
  });

  const { verifiedOfflineNamespaceKey, offlineNamespaceKey } = useAppAuthenticatedOfflineSyncLifecycle({
    workflowStep,
    connection: activeConnection,
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
    connection: activeConnection,
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
    refreshActiveConnection();
  }

  function returnToConnect(options?: { replace?: boolean }) {
    const publication = beginActiveConnectionPublication(activeConnection);
    if (!publication) return;
    publishActiveConnectionResult(publication, () => {
      clearAuthorizationFailure();
      clearActiveConnection();
      closeReader();
      refreshActiveConnection();
      navigateTo({ kind: "connect" }, options);
    });
  }

  function handleDisconnect() {
    returnToConnect();
  }

  function handleRepairConnection() {
    if (!activeConnection) return;
    const publication = beginActiveConnectionPublication(activeConnection);
    if (!publication) return;
    publishActiveConnectionResult(publication, () => {
      saveActiveConnection(markConnectionRepairRequired(activeConnection));
      refreshActiveConnection();
      navigateTo({ kind: "pair" });
    });
  }

  async function handleCancelPairing(): Promise<"completed" | "cancelled" | "failed"> {
    if (activeConnection?.authenticationState !== "repair-required") {
      returnToConnect({ replace: true });
      return "completed";
    }

    const result = await removeConnectionAndOfflineData({
      expectedConnection: activeConnection,
      intent: "sign-out",
      namespaceKey: verifiedOfflineNamespaceKey,
      client: null,
      connectivity: browserConnectivity,
      confirm: (message) => window.confirm(message),
      onRemoved: () => returnToConnect({ replace: true }),
    });
    return result.status === "removed" ? "completed"
      : result.status === "superseded" ? "cancelled"
        : result.status;
  }

  return (
    <div className={`appShell ${openedBook && route?.kind === "reader" ? "appShellReader" : ""}`}>
      {openedBook && route?.kind === "reader" ? null : (
        <AppHeader
          connection={activeConnection}
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
        hasConnection={Boolean(activeConnection)}
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
              connection={activeConnection}
              onConnectionChanged={handleConnectionChanged}
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
                onConnectionChanged={handleConnectionChanged}
              />
            ) : null}

            {workflowStep === "pair_device" ? (
              <ClientApiLinking
                connection={activeConnection}
                onConnectionChanged={handleConnectionChanged}
                onCancel={handleCancelPairing}
              />
            ) : null}

            {workflowStep === "verify_connection" ? (
              <section className="panel workflowPanel">
                <h1 className="panelTitle">Verify connection</h1>
                <ServerSummary connection={activeConnection} />
                <ClientApiVerification
                  connection={activeConnection}
                  onConnectionChanged={handleConnectionChanged}
                  autoVerify
                />
              </section>
            ) : null}

            {workflowStep === "library_home" ? (
              <AppLibraryRouteRenderer
                route={route}
                connection={activeConnection}
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
          connection={activeConnection}
          spl={splClient}
          connectivity={browserConnectivity}
          offlineNamespaceKey={offlineNamespaceKey}
          onOpenReader={openReaderFromBookDetail}
        />
      ) : null}
    </div>
  );
}

function ServerSummary({ connection }: { connection: ActiveConnection | null }) {
  if (!connection) return <p className="muted">No library connected.</p>;
  return (
    <div className="serverSummary">
      <div className="detailRow">
        <span className="muted">Library:</span> {connection.serverName ?? connection.label}
      </div>
      <div className="detailRow">
        <span className="muted">Server URL:</span> <span className="mono">{connection.serverBaseUrl}</span>
      </div>
      {connection.serverName ? (
        <div className="detailRow">
          <span className="muted">Name:</span> {connection.serverName}
        </div>
      ) : null}
      {connection.serverDescription ? (
        <div className="detailRow">
          <span className="muted">Description:</span>
          <ServerRichText value={connection.serverDescription} />
        </div>
      ) : null}
      {connection.apiBaseUrl ? (
        <div className="detailRow">
          <span className="muted">API base:</span> <span className="mono">{connection.apiBaseUrl}</span>
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
