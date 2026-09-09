import { useState } from "react";
import { ApiError } from "@secondpass/client";
import type { ConnectionProfile } from "../storage/ConnectionProfiles.Store";
import { saveConnectionProfile } from "../storage/ConnectionProfiles.Store";
import type { AppTheme } from "../storage/AppTheme.Store";
import { discoverSecondPass } from "../features/connection/ConnectionServer.Queries";
import { applyAuthenticatedContextToProfile } from "../features/connection/ConnectionAccountProfile.Mapper";
import { loadAuthenticatedContext } from "../features/connection/AuthenticatedContext.Queries";
import { createSplClientFromProfile } from "./AppSplClient.Factory";
import { navigateTo, type AppRoute, type SettingsTab } from "./AppNavigation.Router";
import { getTechnicalErrorDetail, isAuthenticationRepairError, isAuthorizationError } from "./AppUserFacingErrors.Mapper";
import { SettingsAppearancePanel } from "./settings/SettingsAppearance.Panel";
import {
  SettingsLibraryServerPanel,
  type SettingsLibraryServerActionState,
} from "./settings/SettingsLibraryServer.Panel";
import { SettingsToolsPanel } from "./settings/SettingsTools.Panel";
import type { OfflineReaderSyncClient } from "./offline/OfflineReaderSync.Actions";
import { OfflineSettingsPanel } from "./settings/offline/OfflineSettings.Panel";
import { getBrowserConnectivitySnapshot } from "./connectivity/BrowserConnectivity.State";
import { forgetConnectionAndOfflineData } from "../features/connection/ConnectionRemoval.Controller";

type Props = {
  profile: ConnectionProfile | null;
  onProfilesChanged: () => void;
  onDisconnect: () => void;
  onRepairConnection: () => void;
  appTheme: AppTheme;
  onAppThemeChange: (theme: AppTheme) => void;
  route: Extract<AppRoute, { kind: "settings" }>;
  offlineNamespaceKey: string | null;
  offlineSyncClient: OfflineReaderSyncClient | null;
};

export function SettingsPanel({
  profile,
  onProfilesChanged,
  onDisconnect,
  onRepairConnection,
  appTheme,
  onAppThemeChange,
  route,
  offlineNamespaceKey,
  offlineSyncClient,
}: Props) {
  const [state, setState] = useState<SettingsLibraryServerActionState>({ phase: "idle" });
  const activeTab = route.tab ?? "appearance";

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
        serverVersion: discovery.server_version,
        serverRelease: discovery.server_release,
        serverReleaseDate: discovery.server_release_date,
        apiBaseUrl: discovery.api_base_url,
        lastCheckedAt: now,
      };

      const { currentUser, serverInfo } = await loadAuthenticatedContext(createSplClientFromProfile(discoveredProfile));
      saveConnectionProfile(applyAuthenticatedContextToProfile(discoveredProfile, currentUser, serverInfo, now));
      onProfilesChanged();
      setState({ phase: "success", message: "Connection checked successfully." });
    } catch (e) {
      if (isAuthenticationRepairError(e)) onRepairConnection();
      setState({
        phase: "error",
        action: "check",
        message: isAuthenticationRepairError(e)
          ? "This saved connection needs to be repaired."
          : isAuthorizationError(e)
            ? "The library server did not allow this connection check."
            : "Connection check failed.",
        technicalDetail: getTechnicalErrorDetail(e),
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
      if (!response.ok) {
        const kind = response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : "http_error";
        throw new ApiError({
          kind,
          status: response.status,
          statusText: response.statusText,
          message: `Logout failed with HTTP ${response.status}.`,
        });
      }
      onDisconnect();
    } catch (e) {
      setState({
        phase: "error",
        action: "logout",
        message: isAuthorizationError(e)
          ? "This device is no longer authorized. Sign out locally if server logout is unavailable."
          : "Logout failed.",
        technicalDetail: getTechnicalErrorDetail(e),
      });
    }
  }

  async function forgetConnection() {
    if (!profile || state.phase === "forgetting") return;
    setState({ phase: "forgetting" });
    const result = await forgetConnectionAndOfflineData({
      namespaceKey: offlineNamespaceKey,
      client: offlineSyncClient,
      connectivity: getBrowserConnectivitySnapshot(),
      confirm: (message) => window.confirm(message),
      onRemoved: onDisconnect,
    });
    if (result.status === "cancelled") {
      setState({ phase: "idle" });
    } else if (result.status === "failed") {
      setState({
        phase: "error",
        action: "forget",
        message: "The connection and its local data could not be removed.",
      });
    }
  }

  return (
    <div className="settingsLayout">
      <section className="settingsSection">
        <h1 className="settingsTitle">Settings</h1>
      </section>

      <div className="segmentedControl settingsTabs" role="tablist" aria-label="Settings sections">
        {([
          { value: "appearance", label: "Appearance" },
          { value: "offline", label: "Offline" },
          { value: "library-server", label: "Library Server" },
          { value: "tools", label: "Tools" },
        ] as Array<{ value: SettingsTab; label: string }>).map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`segmentedButton${activeTab === tab.value ? " segmentedButtonActive" : ""}`}
            role="tab"
            aria-selected={activeTab === tab.value}
            onClick={() => navigateTo({ kind: "settings", tab: tab.value })}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "appearance" ? (
        <SettingsAppearancePanel appTheme={appTheme} onAppThemeChange={onAppThemeChange} />
      ) : null}

      {activeTab === "library-server" ? (
        <SettingsLibraryServerPanel
          profile={profile}
          state={state}
          busy={state.phase === "checking" || state.phase === "logging_out" || state.phase === "forgetting"}
          onConnect={() => navigateTo({ kind: "connect" })}
          onCheckConnection={() => void checkConnection()}
          onLogOut={() => void logOut()}
          onSignOutLocally={onDisconnect}
          onRepairConnection={onRepairConnection}
          onForgetLocally={() => void forgetConnection()}
        />
      ) : null}

      {activeTab === "offline" ? (
        <OfflineSettingsPanel
          namespaceKey={offlineNamespaceKey}
          client={offlineSyncClient}
          selectedBookId={route.bookId ?? null}
          onSelectBook={(bookId) => navigateTo({ kind: "settings", tab: "offline", bookId })}
          onOpenReader={(bookId) => navigateTo({ kind: "reader", bookId })}
        />
      ) : null}

      <SettingsToolsPanel active={activeTab === "tools"} />
    </div>
  );
}
