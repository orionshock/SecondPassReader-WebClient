import { useEffect, useState } from "react";
import type { SecondPassDiscovery } from "@secondpass/client";
import {
  getActiveConnection,
  saveConnectionProfile,
  touchConnectionProfileLastUsed,
  type ConnectionProfile,
} from "../../storage/connectionProfiles";
import { verifySecondPassServer } from "./connectionUtils";
import { loadServerPresets, type ServerPreset } from "./serverPresets";

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
    serverVersion: discovery.server_version,
    serverRelease: discovery.server_release,
    serverReleaseDate: discovery.server_release_date,
    apiBaseUrl: discovery.api_base_url,
  };
}

export function ConnectServerScreen({ selectedProfileId, onSelectedProfileIdChange, onProfilesChanged }: Props) {
  const [serverUrlInput, setServerUrlInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presets, setPresets] = useState<ServerPreset[]>([]);

  useEffect(() => {
    let active = true;
    void loadServerPresets().then((loaded) => {
      if (active) setPresets(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleConnect() {
    setError(null);
    setBusy(true);
    try {
      const { serverBaseUrl, discovery } = await verifySecondPassServer(serverUrlInput);
      const summary = formatDiscoverySummary(discovery);

      const now = new Date().toISOString();
      const existing = getActiveConnection();

      const label = summary.serverName || summary.serverDescription || serverBaseUrl;

      const updated: ConnectionProfile = {
        id: existing?.id ?? selectedProfileId ?? newProfileId(),
        createdAt: existing?.createdAt ?? now,
        label,
        serverBaseUrl,
        serverName: summary.serverName,
        serverDescription: summary.serverDescription,
        serverVersion: summary.serverVersion,
        serverRelease: summary.serverRelease,
        serverReleaseDate: summary.serverReleaseDate,
        apiBaseUrl: summary.apiBaseUrl,
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
        {presets.length > 0 ? (
          <fieldset className="serverPresets">
            <legend className="fieldLabel">Known servers</legend>
            {presets.map((preset) => (
              <button
                className="button serverPresetButton"
                type="button"
                key={`${preset.name}:${preset.url}`}
                onClick={() => setServerUrlInput(preset.url)}
              >
                <span>{preset.name}</span>
                <span className="muted mono">{preset.url}</span>
              </button>
            ))}
            <div className="fieldHelp muted">Presets are suggestions. The selected server is verified before pairing.</div>
          </fieldset>
        ) : null}
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

        <div className="formActions">
          <button className="button buttonPrimary" type="submit" disabled={busy}>
            {busy ? "Connecting..." : "Connect"}
          </button>
        </div>

        {error ? <p className="errorText">{error}</p> : null}
      </form>
    </section>
  );
}
