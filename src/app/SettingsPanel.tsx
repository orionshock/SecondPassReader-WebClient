import { useEffect, useState } from "react";
import type { ConnectionProfile } from "../storage/connectionProfiles";
import { saveConnectionProfile } from "../storage/connectionProfiles";
import type { AppTheme } from "../storage/appTheme";
import { getConnectionStatus, getConnectionStatusLabel } from "../features/connection/connectionStatus";
import { discoverSecondPass } from "../features/connection/connectionUtils";
import { applyCurrentAccountToProfile } from "../features/connection/accountProfile";
import { createSplClientFromProfile } from "./createSplClient";
import { navigateTo, type AppRoute, type SettingsTab } from "./navigation";
import {
  buildAllZipEntries,
  filterMarginaliaBookGroups,
  formatMarginaliaSessionLabel,
  groupMarginaliaSplitItems,
  type MarginaliaBookGroup,
  parseAndSplitMarginaliaExport,
  type MarginaliaSplitResult,
} from "../features/settings/marginaliaSplitExport";
import { createMarginaliaZipBlob } from "../features/settings/marginaliaZipExport";
import { IMPORT_DEBUG_KEY, IMPORT_DEBUG_VERBOSE_KEY } from "../features/reader/imports/readerImportDebug";

type Props = {
  profile: ConnectionProfile | null;
  onProfilesChanged: () => void;
  onForgetServer: () => void;
  appTheme: AppTheme;
  onAppThemeChange: (theme: AppTheme) => void;
  route: Extract<AppRoute, { kind: "settings" }>;
};

type ActionState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "logging_out" }
  | { phase: "success"; message: string }
  | { phase: "error"; message: string; action: "check" | "logout" };

type MarginaliaToolState =
  | { phase: "idle" }
  | { phase: "loaded"; fileName: string; result: MarginaliaSplitResult }
  | { phase: "error"; message: string };

export function SettingsPanel({
  profile,
  onProfilesChanged,
  onForgetServer,
  appTheme,
  onAppThemeChange,
  route,
}: Props) {
  const [state, setState] = useState<ActionState>({ phase: "idle" });
  const [marginaliaState, setMarginaliaState] = useState<MarginaliaToolState>({ phase: "idle" });
  const [hideEmptyMarginaliaSessions, setHideEmptyMarginaliaSessions] = useState(false);
  const [importDebugEnabled, setImportDebugEnabled] = useState(() => readLocalStorageFlag(IMPORT_DEBUG_KEY));
  const [importDebugVerbose, setImportDebugVerbose] = useState(() => readLocalStorageFlag(IMPORT_DEBUG_VERBOSE_KEY));
  const activeTab = route.tab ?? "appearance";

  useEffect(() => {
    if (activeTab !== "tools") {
      setMarginaliaState({ phase: "idle" });
      setHideEmptyMarginaliaSessions(false);
    }
  }, [activeTab]);

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

      const me = await createSplClientFromProfile(discoveredProfile).account.getCurrent();
      saveConnectionProfile(applyCurrentAccountToProfile(discoveredProfile, me, now));
      onProfilesChanged();
      setState({ phase: "success", message: "Connection checked successfully." });
    } catch (e) {
      setState({
        phase: "error",
        action: "check",
        message: e instanceof Error ? e.message : "Connection check failed.",
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
      if (!response.ok) throw new Error(`Logout failed with HTTP ${response.status}.`);
      onForgetServer();
    } catch (e) {
      setState({
        phase: "error",
        action: "logout",
        message: e instanceof Error ? e.message : "Logout failed.",
      });
    }
  }

  function forgetLocally() {
    onForgetServer();
  }

  async function handleMarginaliaFile(file: File | null) {
    if (!file) {
      setMarginaliaState({ phase: "idle" });
      setHideEmptyMarginaliaSessions(false);
      return;
    }

    try {
      const text = await file.text();
      const result = parseAndSplitMarginaliaExport(text);
      setMarginaliaState({ phase: "loaded", fileName: file.name, result });
    } catch (error) {
      setMarginaliaState({
        phase: "error",
        message: error instanceof Error ? error.message : "Failed to parse marginalia export.",
      });
    }
  }

  function clearMarginaliaFile() {
    setMarginaliaState({ phase: "idle" });
    setHideEmptyMarginaliaSessions(false);
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function downloadMarginaliaSplit(item: MarginaliaSplitResult["items"][number]) {
    downloadBlob(new Blob([`${JSON.stringify(item.exportJson, null, 2)}\n`], { type: "application/json" }), item.filename);
  }

  function downloadMarginaliaBookZip(group: MarginaliaBookGroup) {
    const entries = group.items.map((item) => ({ path: item.filename, item }));
    downloadBlob(createMarginaliaZipBlob(entries), group.zipFilename);
  }

  function downloadAllMarginaliaZip(groups: MarginaliaBookGroup[]) {
    downloadBlob(createMarginaliaZipBlob(buildAllZipEntries(groups)), "secondpass-marginalia-sessions.zip");
  }

  function updateImportDebugEnabled(enabled: boolean) {
    setImportDebugEnabled(enabled);
    writeLocalStorageFlag(IMPORT_DEBUG_KEY, enabled);
    if (!enabled) {
      setImportDebugVerbose(false);
      writeLocalStorageFlag(IMPORT_DEBUG_VERBOSE_KEY, false);
    }
  }

  function updateImportDebugVerbose(enabled: boolean) {
    setImportDebugVerbose(enabled);
    writeLocalStorageFlag(IMPORT_DEBUG_VERBOSE_KEY, enabled);
  }

  const status = getConnectionStatus(profile);
  const busy = state.phase === "checking" || state.phase === "logging_out";
  const marginaliaGroups = marginaliaState.phase === "loaded" ? groupMarginaliaSplitItems(marginaliaState.result.items) : [];
  const visibleMarginaliaGroups = filterMarginaliaBookGroups(marginaliaGroups, hideEmptyMarginaliaSessions);
  const hiddenEmptySessionCount =
    marginaliaState.phase === "loaded" && hideEmptyMarginaliaSessions
      ? marginaliaState.result.items.filter((item) => item.annotationCount === 0).length
      : 0;
  const visibleMarginaliaSummary = {
    bookCount: visibleMarginaliaGroups.length,
    sessionCount: visibleMarginaliaGroups.reduce((total, group) => total + group.items.length, 0),
    annotationCount: visibleMarginaliaGroups.reduce(
      (total, group) => total + group.items.reduce((groupTotal, item) => groupTotal + item.annotationCount, 0),
      0,
    ),
  };

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
      <section className="panel settingsCard" role="tabpanel" aria-label="Appearance settings">
        <div className="settingsSectionHeader">
          <h2 className="panelTitle">Appearance</h2>
        </div>
        <div className="settingsRow">
          <div>
            <div className="settingsLabel">Theme</div>
          </div>
          <div className="segmentedControl" role="radiogroup" aria-label="Theme">
            {(["system", "light", "dark"] as AppTheme[]).map((theme) => (
              <button
                key={theme}
                type="button"
                className={`segmentedButton${appTheme === theme ? " segmentedButtonActive" : ""}`}
                role="radio"
                aria-checked={appTheme === theme}
                onClick={() => onAppThemeChange(theme)}
              >
                {theme[0].toUpperCase() + theme.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </section>
      ) : null}

      {activeTab === "library-server" ? (
      <div className="settingsTabPanel" role="tabpanel" aria-label="Library Server settings">
        <section className="panel settingsCard">
          <div className="settingsSectionHeader">
            <h2 className="panelTitle">Connected Library</h2>
            <span className={`pill ${status === "verified" ? "pillOk" : status === "not_configured" ? "pillIdle" : "pillWarn"}`}>
              {getConnectionStatusLabel(status)}
            </span>
          </div>

          {!profile ? (
            <div className="settingsEmpty">
              <p className="muted">No library is connected in this browser.</p>
              <button type="button" className="button buttonPrimary" onClick={() => navigateTo({ kind: "connect" })}>
                Connect library
              </button>
            </div>
          ) : (
            <>
              <div className="settingsGrid">
                <Detail label="Library" value={profile.serverName ?? profile.label} />
                {profile.serverDescription ? <Detail label="Description" value={profile.serverDescription} /> : null}
                <Detail label="Server URL" value={profile.serverBaseUrl} mono />
                <Detail label="Signed-in user" value={formatUser(profile)} />
                <Detail label="This device" value={profile.clientSessionName ?? "Unknown"} />
                <Detail label="Last checked" value={formatTimestamp(profile.lastCheckedAt ?? profile.verifiedAt)} />
              </div>
              <div className="settingsActions">
                <button type="button" className="button" onClick={() => void checkConnection()} disabled={busy}>
                  {state.phase === "checking" ? `Checking${"\u2026"}` : "Check connection"}
                </button>
              </div>
            </>
          )}
        </section>

        <section className="panel settingsCard">
          <div className="settingsSectionHeader">
            <h2 className="panelTitle">This Device</h2>
          </div>
          <p className="muted">
            Log out revokes this device session on the server and removes the local connection from this browser. Server
            books and annotations are not deleted.
          </p>
          <div className="settingsActions">
            <button type="button" className="button buttonDanger" onClick={() => void logOut()} disabled={!profile || busy}>
              {state.phase === "logging_out" ? `Logging out${"\u2026"}` : "Log out"}
            </button>
          </div>
          {profile ? (
            <div className="settingsLocalFallback">
              <span className="muted">If logout fails, you can forget this connection locally.</span>
              <button
                type="button"
                className="settingsLinkButton"
                onClick={forgetLocally}
                disabled={state.phase === "logging_out"}
              >
                Forget locally
              </button>
            </div>
          ) : null}
        </section>

        {state.phase === "success" ? <p className="settingsNotice">{state.message}</p> : null}
        {state.phase === "error" ? <p className="errorText">{state.message}</p> : null}
      </div>
      ) : null}

      {activeTab === "tools" ? (
      <div className="settingsTabPanel" role="tabpanel" aria-label="Tools settings">
        <section className="panel settingsCard settingsMaintenance">
          <div className="settingsSectionHeader">
            <h2 className="panelTitle">Marginalia export splitter</h2>
          </div>
          <div className="settingsCopyBlock">
            <p>Split a SecondPassMarginaliaExport JSON file into one file per reading session.</p>
            <p className="muted">
              This only repackages the export. It does not repair selectors, match quotes, import annotations, or contact
              the library server.
            </p>
          </div>
          <div className="settingsControlBlock">
            <div className="settingsFileRow">
              <label className="button" htmlFor="marginaliaExportFile">
                Upload export JSON
              </label>
              <input
                id="marginaliaExportFile"
                className="settingsHiddenFileInput"
                type="file"
                accept="application/json,.json"
                onChange={(event) => void handleMarginaliaFile(event.currentTarget.files?.[0] ?? null)}
              />
              {marginaliaState.phase !== "idle" ? (
                <button type="button" className="button" onClick={clearMarginaliaFile}>
                  Clear
                </button>
              ) : null}
            </div>
            <p className="muted">Creates session JSON files, book ZIPs, and one all-sessions ZIP.</p>
          </div>

          {marginaliaState.phase === "error" ? <p className="errorText">{marginaliaState.message}</p> : null}
          {marginaliaState.phase === "loaded" ? (
            <div className="marginaliaSplitPanel">
              <div className="settingsGrid marginaliaSplitSummary">
                <Detail label="File" value={marginaliaState.fileName} />
                <div className="settingsStatRow" aria-label="Export summary">
                  <span className="settingsStatChip">Books: {visibleMarginaliaSummary.bookCount}</span>
                  <span className="settingsStatChip">Sessions: {visibleMarginaliaSummary.sessionCount}</span>
                  <span className="settingsStatChip">Annotations: {visibleMarginaliaSummary.annotationCount}</span>
                  <label className="settingsCheckboxRow settingsStatFilter">
                    <input
                      type="checkbox"
                      checked={hideEmptyMarginaliaSessions}
                      onChange={(event) => setHideEmptyMarginaliaSessions(event.currentTarget.checked)}
                    />
                    <span>Hide empty sessions</span>
                  </label>
                  {hiddenEmptySessionCount > 0 ? (
                    <span className="muted">{hiddenEmptySessionCount} empty session{hiddenEmptySessionCount === 1 ? "" : "s"} hidden.</span>
                  ) : null}
                </div>
              </div>
              {marginaliaState.result.items.length === 0 ? (
                <p className="muted">No sessions were found to split.</p>
              ) : visibleMarginaliaGroups.length === 0 ? (
                <p className="muted">No sessions with annotations are visible.</p>
              ) : (
                <>
                  <div className="settingsActions">
                    <button type="button" className="button" onClick={() => downloadAllMarginaliaZip(visibleMarginaliaGroups)}>
                      Download all ZIP
                    </button>
                    <span className="muted">Includes one folder per book and one JSON file per visible session.</span>
                  </div>
                  <div className="marginaliaSplitList">
                    {visibleMarginaliaGroups.map((group) => (
                      <div className="marginaliaSplitGroup" key={group.id}>
                        <div className="marginaliaSplitGroupHeader">
                          <div className="settingsLabel">{group.bookLabel}</div>
                          <button type="button" className="button" onClick={() => downloadMarginaliaBookZip(group)}>
                            Download book ZIP
                          </button>
                        </div>
                        <div className="marginaliaSplitGroupItems">
                          {group.items.map((item) => (
                            <div className="marginaliaSplitItem" key={item.id}>
                              <div className="marginaliaSplitText">
                                <div className="muted">{formatMarginaliaSessionLabel(item.session)}</div>
                                <div className="muted">{item.annotationCount} annotation{item.annotationCount === 1 ? "" : "s"}</div>
                              </div>
                              <button type="button" className="button" onClick={() => downloadMarginaliaSplit(item)}>
                                Download session JSON
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </section>
        <section className="panel settingsCard settingsDiagnostics">
          <div className="settingsSectionHeader">
            <h2 className="panelTitle">Diagnostics</h2>
          </div>
          <div className="settingsControlBlock">
            <label className="settingsCheckboxRow">
              <input
                type="checkbox"
                checked={importDebugEnabled}
                onChange={(event) => updateImportDebugEnabled(event.currentTarget.checked)}
              />
              <span>Enable import search debug logging</span>
            </label>
            <p className="muted">Writes compact import search diagnostics to the browser console.</p>
            {importDebugEnabled ? (
              <>
                <label className="settingsCheckboxRow">
                  <input
                    type="checkbox"
                    checked={importDebugVerbose}
                    onChange={(event) => updateImportDebugVerbose(event.currentTarget.checked)}
                  />
                  <span>Verbose import search logging</span>
                </label>
                <p className="muted">Includes short text/query previews. Use only while debugging.</p>
              </>
            ) : null}
          </div>
        </section>
      </div>
      ) : null}
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="detailRow">
      <span className="muted">{label}:</span> <span className={mono ? "mono" : undefined}>{value}</span>
    </div>
  );
}

function formatUser(profile: ConnectionProfile): string {
  const user = profile.verifiedUser;
  if (!user) return "Unknown";
  const first = typeof user.firstName === "string" ? user.firstName.trim() : "";
  const last = typeof user.lastName === "string" ? user.lastName.trim() : "";
  const display = typeof user.displayName === "string" ? user.displayName.trim() : "";
  const username = typeof user.username === "string" ? user.username.trim() : "";
  const name = first && last ? `${first} ${last}` : display;
  if (name && username) return `<${name}>@${username}`;
  if (name) return `<${name}>`;
  if (username) return `@${username}`;
  return "Unknown";
}

function formatTimestamp(value?: string): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function readLocalStorageFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeLocalStorageFlag(key: string, enabled: boolean): void {
  try {
    if (enabled) {
      window.localStorage.setItem(key, "1");
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore unavailable browser storage.
  }
}
