import { useMemo, useState } from "react";
import type { SecondPassDiscovery } from "../../schemas/clientApiAuth";
import {
  listConnectionProfiles,
  saveConnectionProfile,
  touchConnectionProfileLastUsed,
  type ConnectionProfile,
} from "../../storage/connectionProfiles";
import { discoverSecondPass, normalizeServerBaseUrl } from "./connectionUtils";

type Props = {
  selectedProfileId: string | null;
  onSelectedProfileIdChange: (profileId: string | null) => void;
  onProfilesChanged: () => void;
};

function newProfileId() {
  try {
    // Browser secure contexts should have this.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyCrypto = crypto as any;
    if (typeof anyCrypto?.randomUUID === "function") return `cp_${anyCrypto.randomUUID()}`;
  } catch {
    // ignore
  }
  return `cp_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function formatDiscoverySummary(discovery: SecondPassDiscovery) {
  return {
    serverName: discovery.server_name,
    serverDescription: discovery.server_description,
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

export function ConnectServerScreen({ selectedProfileId, onSelectedProfileIdChange, onProfilesChanged }: Props) {
  const [serverUrlInput, setServerUrlInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProfile = useMemo(() => {
    if (!selectedProfileId) return null;
    return listConnectionProfiles().find((p) => p.id === selectedProfileId) ?? null;
  }, [selectedProfileId]);

  async function handleConnect() {
    setError(null);
    setBusy(true);
    try {
      const { serverBaseUrl } = normalizeServerBaseUrl(serverUrlInput);
      const discovery = await discoverSecondPass(serverBaseUrl);
      const summary = formatDiscoverySummary(discovery);

      const profiles = listConnectionProfiles();
      const now = new Date().toISOString();
      const existing = profiles.find((p) => p.serverBaseUrl === serverBaseUrl) ?? null;

      const label =
        labelInput.trim() ||
        existing?.label ||
        summary.serverName ||
        summary.serverDescription ||
        serverBaseUrl;

      const updated: ConnectionProfile = {
        ...(existing ?? { id: newProfileId(), createdAt: now }),
        label,
        serverBaseUrl,
        serverName: summary.serverName,
        serverDescription: summary.serverDescription,
        apiBaseUrl: summary.apiBaseUrl,
        clientApi: summary.clientApi,
        lastUsedAt: now,
      };

      saveConnectionProfile(updated);
      touchConnectionProfileLastUsed(updated.id, now);
      onProfilesChanged();
      onSelectedProfileIdChange(updated.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect to the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel connectScreen">
      <h2 className="panelTitle">Connect to a Second Pass server</h2>

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void handleConnect();
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
            autoFocus
          />
          <div className="fieldHelp muted">Examples: localhost:8000, http://localhost:8000/app/</div>
        </label>

        <details className="connectAdvanced">
          <summary className="muted">Optional label</summary>
          <label className="field">
            <span className="fieldLabel">Label</span>
            <input
              className="input"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              placeholder="Home server"
              autoComplete="off"
            />
          </label>
        </details>

        <div className="formActions">
          <button className="button buttonPrimary" type="submit" disabled={busy}>
            {busy ? "Connecting..." : "Connect"}
          </button>
        </div>

        {error ? <p className="errorText">{error}</p> : null}
      </form>

      {selectedProfile ? (
        <div className="muted">
          Current selection: <span className="mono">{selectedProfile.serverBaseUrl}</span>
        </div>
      ) : null}
    </section>
  );
}
