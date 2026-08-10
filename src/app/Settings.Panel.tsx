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
import { getTechnicalErrorDetail, isAuthorizationError } from "./AppUserFacingErrors.Mapper";
import { SettingsAppearancePanel } from "./settings/SettingsAppearance.Panel";
import {
  SettingsLibraryServerPanel,
  type SettingsLibraryServerActionState,
} from "./settings/SettingsLibraryServer.Panel";
import { SettingsToolsPanel } from "./settings/SettingsTools.Panel";

type Props = {
  profile: ConnectionProfile | null;
  onProfilesChanged: () => void;
  onForgetServer: () => void;
  appTheme: AppTheme;
  onAppThemeChange: (theme: AppTheme) => void;
  route: Extract<AppRoute, { kind: "settings" }>;
};

export function SettingsPanel({
  profile,
  onProfilesChanged,
  onForgetServer,
  appTheme,
  onAppThemeChange,
  route,
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
      setState({
        phase: "error",
        action: "check",
        message: isAuthorizationError(e)
          ? "This device is no longer authorized."
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
      onForgetServer();
    } catch (e) {
      setState({
        phase: "error",
        action: "logout",
        message: isAuthorizationError(e)
          ? "This device is no longer authorized. Forget it locally if server logout is unavailable."
          : "Logout failed.",
        technicalDetail: getTechnicalErrorDetail(e),
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
          busy={state.phase === "checking" || state.phase === "logging_out"}
          onConnect={() => navigateTo({ kind: "connect" })}
          onCheckConnection={() => void checkConnection()}
          onLogOut={() => void logOut()}
          onForgetLocally={onForgetServer}
        />
      ) : null}

      <SettingsToolsPanel active={activeTab === "tools"} />
    </div>
  );
}
