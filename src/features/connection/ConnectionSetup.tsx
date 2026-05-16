import { useMemo, useState } from "react";
import type { SecondPassDiscovery } from "../../schemas/clientApiAuth";
import {
  deleteConnectionProfile,
  listConnectionProfiles,
  saveConnectionProfile,
  touchConnectionProfileLastUsed,
  type ConnectionProfile,
} from "../../storage/connectionProfiles";
import { ConnectionProfileList } from "./ConnectionProfileList";
import { discoverSecondPass, normalizeServerBaseUrl } from "./connectionUtils";

type Props = {
  selectedProfileId?: string | null;
  onSelectedProfileIdChange: (profileId: string | null) => void;
  onProfilesChanged?: () => void;
};

function newProfileId() {
  return `cp_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function formatDiscoverySummary(discovery: SecondPassDiscovery) {
  return {
    serverName: discovery.server_name,
    apiBaseUrl: discovery.api_base_url,
    clientApi: {
      discoveryVersion: discovery.client_api.discovery_version,
      discoveryEndpoint: discovery.client_api.discovery_endpoint,
      loginRequestEndpoint: discovery.client_api.login_request_endpoint,
      authorizeUrl: discovery.client_api.authorize_url,
      pollEndpointTemplate: discovery.client_api.poll_endpoint_template,
    },
  };
}

export function ConnectionSetup({ selectedProfileId, onSelectedProfileIdChange, onProfilesChanged }: Props) {
  const [serverUrlInput, setServerUrlInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [profilesVersion, setProfilesVersion] = useState(0);
  const [busy, setBusy] = useState<"save" | "discover" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [discovery, setDiscovery] = useState<SecondPassDiscovery | null>(null);

  const profiles = useMemo(() => listConnectionProfiles(), [profilesVersion]);
  const selectedProfile = profiles.find((p) => p.id === selectedProfileId) ?? null;

  function refreshProfiles() {
    setProfilesVersion((v) => v + 1);
    onProfilesChanged?.();
  }

  async function handleSaveProfile() {
    setError(null);
    setDiscovery(null);
    setBusy("save");
    try {
      const { serverBaseUrl } = normalizeServerBaseUrl(serverUrlInput);
      const label = labelInput.trim() || serverBaseUrl;

      const now = new Date().toISOString();
      const existing = profiles.find((p) => p.serverBaseUrl === serverBaseUrl) ?? null;
      const profile: ConnectionProfile = {
        ...(existing ?? { id: newProfileId(), createdAt: now }),
        label,
        serverBaseUrl,
      };

      saveConnectionProfile(profile);
      refreshProfiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save profile.");
    } finally {
      setBusy(null);
    }
  }

  async function handleTestDiscovery() {
    setError(null);
    setDiscovery(null);
    setBusy("discover");
    try {
      const { serverBaseUrl } = normalizeServerBaseUrl(serverUrlInput);
      const result = await discoverSecondPass(serverBaseUrl);
      setDiscovery(result);

      const existing = profiles.find((p) => p.serverBaseUrl === serverBaseUrl) ?? null;
      const summary = formatDiscoverySummary(result);

      if (existing) {
        const updated: ConnectionProfile = {
          ...existing,
          serverBaseUrl,
          serverName: summary.serverName,
          apiBaseUrl: summary.apiBaseUrl,
          clientApi: summary.clientApi,
          lastUsedAt: existing.lastUsedAt ?? undefined,
        };
        saveConnectionProfile(updated);
        refreshProfiles();
      }

      if (!existing) {
        setServerUrlInput(serverBaseUrl);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Discovery failed.");
    } finally {
      setBusy(null);
    }
  }

  function handleSelect(profileId: string) {
    touchConnectionProfileLastUsed(profileId);
    onSelectedProfileIdChange(profileId);
    refreshProfiles();
  }

  function handleDelete(profileId: string) {
    deleteConnectionProfile(profileId);
    if (profileId === selectedProfileId) onSelectedProfileIdChange(null);
    refreshProfiles();
  }

  return (
    <div className="connectionGrid">
      <section className="panel">
        <h2 className="panelTitle">Connection setup</h2>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSaveProfile();
          }}
        >
          <label className="field">
            <span className="fieldLabel">Server URL</span>
            <input
              className="input"
              value={serverUrlInput}
              onChange={(e) => setServerUrlInput(e.target.value)}
              placeholder="http://localhost:8000"
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <label className="field">
            <span className="fieldLabel">Label (optional)</span>
            <input
              className="input"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              placeholder="Local dev server"
              autoComplete="off"
            />
          </label>

          <div className="formActions">
            <button className="button buttonPrimary" type="submit" disabled={busy !== null}>
              {busy === "save" ? "Saving…" : "Save profile"}
            </button>
            <button
              className="button"
              type="button"
              onClick={() => void handleTestDiscovery()}
              disabled={busy !== null}
            >
              {busy === "discover" ? "Testing…" : "Test discovery"}
            </button>
          </div>

          {error ? <p className="errorText">{error}</p> : null}
          {discovery ? (
            <div className="discoveryBox" role="status">
              <div>
                <span className="muted">server_name:</span> {discovery.server_name}
              </div>
              <div>
                <span className="muted">api_base_url:</span> <span className="mono">{discovery.api_base_url}</span>
              </div>
              <div>
                <span className="muted">client_api:</span> {discovery.client_api.discovery_version}
              </div>
            </div>
          ) : null}
        </form>
      </section>

      <section className="panel">
        <h2 className="panelTitle">Saved profiles</h2>
        <ConnectionProfileList
          profiles={profiles}
          selectedProfileId={selectedProfileId}
          onSelect={handleSelect}
          onDelete={handleDelete}
        />
      </section>

      <section className="panel">
        <h2 className="panelTitle">Selected profile</h2>
        {selectedProfile ? (
          <div className="selectedSummary">
            <div className="selectedRow">
              <span className="muted">Label:</span> {selectedProfile.label}
            </div>
            <div className="selectedRow">
              <span className="muted">Server:</span> <span className="mono">{selectedProfile.serverBaseUrl}</span>
            </div>
            {selectedProfile.serverName ? (
              <div className="selectedRow">
                <span className="muted">Name:</span> {selectedProfile.serverName}
              </div>
            ) : null}
            {selectedProfile.apiBaseUrl ? (
              <div className="selectedRow">
                <span className="muted">API base:</span> <span className="mono">{selectedProfile.apiBaseUrl}</span>
              </div>
            ) : null}
            <div className="selectedRow">
              <span className="muted">Last used:</span> {selectedProfile.lastUsedAt ?? "—"}
            </div>
          </div>
        ) : (
          <p className="muted">No profile selected.</p>
        )}
      </section>
    </div>
  );
}
