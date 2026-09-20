import { useRef, useState, type KeyboardEvent } from "react";
import type { SecondPassClient } from "@secondpass/client";
import type { ActiveConnection } from "../storage/ActiveConnection.Store";
import {
  beginActiveConnectionPublication,
  isActiveConnectionPublicationCurrent,
  publishActiveConnectionResult,
  saveActiveConnection,
} from "../storage/ActiveConnection.Store";
import type { AppTheme } from "../storage/AppTheme.Store";
import { discoverSecondPass } from "../features/connection/ConnectionServer.Queries";
import { applyAuthenticatedContextToConnection, ServerIdentityMismatchError } from "../features/connection/ConnectionAccountProfile.Mapper";
import { loadAuthenticatedContext } from "../features/connection/AuthenticatedContext.Queries";
import { createSplClientFromConnection } from "./AppSplClient.Factory";
import { navigateTo, type AppRoute, type SettingsTab } from "./AppNavigation.Router";
import { getTechnicalErrorDetail, isAuthenticationRepairError, isAuthorizationError } from "./AppUserFacingErrors.Mapper";
import { SettingsAppearancePanel } from "./settings/SettingsAppearancePanel.UI";
import {
  SettingsLibraryServerPanel,
  type SettingsLibraryServerActionState,
} from "./settings/SettingsLibraryServerPanel.UI";
import { SettingsToolsPanel } from "./settings/SettingsToolsPanel.UI";
import { OfflineSettingsPanel } from "./settings/offline/OfflineSettingsPanel.UI";
import type { BrowserConnectivityStatus } from "./connectivity/BrowserConnectivity.State";
import {
  removeConnectionAndOfflineData,
  type ConnectionRemovalResult,
  type RemoteClientSession,
} from "../features/connection/ConnectionRemoval.Controller";

type Props = {
  connection: ActiveConnection | null;
  onConnectionChanged: () => void;
  onDisconnect: () => void;
  onRepairConnection: () => void;
  appTheme: AppTheme;
  onAppThemeChange: (theme: AppTheme) => void;
  route: Extract<AppRoute, { kind: "settings" }>;
  offlineNamespaceKey: string | null;
  client: SecondPassClient | null;
  connectivity: BrowserConnectivityStatus;
};

export function SettingsPanel({
  connection,
  onConnectionChanged,
  onDisconnect,
  onRepairConnection,
  appTheme,
  onAppThemeChange,
  route,
  offlineNamespaceKey,
  client,
  connectivity,
}: Props) {
  const [state, setState] = useState<SettingsLibraryServerActionState>({ phase: "idle" });
  const activeTab = route.tab ?? "appearance";
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const tabs: Array<{ value: SettingsTab; label: string }> = [
    { value: "appearance", label: "Appearance" },
    { value: "offline", label: "Offline" },
    { value: "library-server", label: "Second Pass Library" },
    { value: "tools", label: "Tools" },
  ];

  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex < 0) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? buttons.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    navigateTo({ kind: "settings", tab: nextTab.value });
    buttons[nextIndex]?.focus();
  }

  async function checkConnection() {
    if (!connection) return;
    if (!connection.accessToken) {
      setState({ phase: "error", action: "check", message: "This connection isn't authorized yet." });
      return;
    }
    const publication = beginActiveConnectionPublication(connection);
    if (!publication) return;

    setState({ phase: "checking" });
    try {
      const discovery = await discoverSecondPass(connection.serverBaseUrl);
      if (!isActiveConnectionPublicationCurrent(publication)) return;
      if (discovery.serverId.toLowerCase() !== connection.serverId.toLowerCase()) {
        throw new ServerIdentityMismatchError();
      }
      const now = new Date().toISOString();
      const discoveredConnection: ActiveConnection = {
        ...connection,
        serverName: discovery.server_name,
        serverDescription: discovery.server_description,
        serverVersion: discovery.server_version,
        serverReleaseDate: discovery.server_release_date,
        lastCheckedAt: now,
      };

      const { currentUser, serverInfo } = await loadAuthenticatedContext(createSplClientFromConnection(discoveredConnection));
      const checkedConnection = applyAuthenticatedContextToConnection(discoveredConnection, currentUser, serverInfo, now);
      publishActiveConnectionResult(publication, () => {
        saveActiveConnection(checkedConnection);
        onConnectionChanged();
        setState({ phase: "success", message: "Connection checked." });
      });
    } catch (e) {
      publishActiveConnectionResult(publication, () => {
        if (isAuthenticationRepairError(e)) onRepairConnection();
        setState({
          phase: "error",
          action: "check",
          message: isAuthenticationRepairError(e)
            ? "This connection needs repair."
            : e instanceof ServerIdentityMismatchError
              ? "This URL returned a different Library server ID. Check the Library URL."
            : isAuthorizationError(e)
              ? "Second Pass Library denied the connection check."
              : "Couldn't check the connection.",
          technicalDetail: getTechnicalErrorDetail(e),
        });
      });
    }
  }

  async function logOut() {
    if (!client || !connection?.clientSessionId) {
      setState({
        phase: "error",
        action: "logout",
        message: "Second Pass Library can't sign out this browser. Sign out locally instead.",
      });
      return;
    }
    await removeConnection("sign-out", "logging_out", {
      client,
      clientSessionId: connection.clientSessionId,
    });
  }

  async function signOutLocally() {
    await removeConnection("sign-out", "signing_out_locally");
  }

  async function forgetConnection() {
    await removeConnection("forget", "forgetting");
  }

  async function removeConnection(
    intent: "sign-out" | "forget",
    phase: "logging_out" | "signing_out_locally" | "forgetting",
    remoteSession?: RemoteClientSession,
  ) {
    if (!connection || state.phase === "logging_out" || state.phase === "signing_out_locally" || state.phase === "forgetting") return;
    setState({ phase });
    const result = await removeConnectionAndOfflineData({
      expectedConnection: connection,
      intent,
      namespaceKey: offlineNamespaceKey,
      client,
      connectivity,
      confirm: (message) => window.confirm(message),
      onRemoved: onDisconnect,
      remoteSession,
    });
    if (result.status === "cancelled") {
      setState({ phase: "idle" });
    } else if (result.status === "failed") {
      setRemovalFailure(result, intent);
    }
  }

  function setRemovalFailure(result: Extract<ConnectionRemovalResult, { status: "failed" }>, intent: "sign-out" | "forget") {
    const action = intent === "sign-out" ? "logout" : "forget";
    if (result.stage === "remote") {
      setState({
        phase: "error",
        action,
        message: isAuthorizationError(result.error)
          ? "Second Pass Library no longer recognizes this browser. Sign out locally instead."
          : "Couldn't sign out of Second Pass Library. Try again or sign out locally.",
        technicalDetail: getTechnicalErrorDetail(result.error),
      });
      return;
    }
    setState({
      phase: "error",
      action,
      message: result.remoteCompleted
        ? "Signed out of Second Pass Library, but offline data couldn't be removed. Sign out locally to try again."
        : "Offline data couldn't be removed. Check browser storage settings and try again.",
      technicalDetail: getTechnicalErrorDetail(result.error),
    });
  }

  return (
    <div className="settingsLayout">
      <section className="settingsSection">
        <h1 className="settingsTitle">Settings</h1>
      </section>

      <div ref={tabListRef} className="segmentedControl settingsTabs" role="tablist" aria-label="Settings sections" onKeyDown={handleTabKeyDown}>
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`segmentedButton${activeTab === tab.value ? " segmentedButtonActive" : ""}`}
            role="tab"
            aria-selected={activeTab === tab.value}
            aria-controls="settings-active-panel"
            id={`settings-${tab.value}-tab`}
            tabIndex={activeTab === tab.value ? 0 : -1}
            onClick={() => navigateTo({ kind: "settings", tab: tab.value })}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div id="settings-active-panel" role="tabpanel" aria-labelledby={`settings-${activeTab}-tab`} tabIndex={0}>
        {activeTab === "appearance" ? (
          <SettingsAppearancePanel appTheme={appTheme} onAppThemeChange={onAppThemeChange} />
        ) : null}
        {activeTab === "library-server" ? (
          <SettingsLibraryServerPanel
            connection={connection}
            state={state}
            busy={state.phase === "checking" || state.phase === "logging_out" || state.phase === "signing_out_locally" || state.phase === "forgetting"}
            onConnect={() => navigateTo({ kind: "connect" })}
            onCheckConnection={() => void checkConnection()}
            onLogOut={() => void logOut()}
            onSignOutLocally={() => void signOutLocally()}
            onRepairConnection={onRepairConnection}
            onForgetLocally={() => void forgetConnection()}
            serverActionsAvailable={connectivity !== "offline"}
          />
        ) : null}
        {activeTab === "offline" ? (
          <OfflineSettingsPanel
            namespaceKey={offlineNamespaceKey}
            client={client}
            selectedBookId={route.bookId ?? null}
            onSelectBook={(bookId) => navigateTo({ kind: "settings", tab: "offline", bookId })}
            onOpenReader={(bookId) => navigateTo({ kind: "reader", bookId })}
          />
        ) : null}
        <SettingsToolsPanel active={activeTab === "tools"} />
      </div>
    </div>
  );
}
