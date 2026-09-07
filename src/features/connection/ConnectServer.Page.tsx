import { useEffect, useState } from "react";
import type { SecondPassDiscovery } from "@secondpass/client";
import { ServerRichText } from "../../components/ServerRichText.Renderer";
import {
  getActiveConnection,
  saveConnectionProfile,
  touchConnectionProfileLastUsed,
  type ConnectionProfile,
} from "../../storage/ConnectionProfiles.Store";
import { verifySecondPassServer } from "./ConnectionServer.Queries";
import { loadServerPresets, type ServerPreset } from "./ServerPresets.Queries";

type Props = {
  selectedProfileId: string | null;
  onSelectedProfileIdChange: (profileId: string | null) => void;
  onProfilesChanged: () => void;
};

type PresetIdentity =
  | { status: "loading" }
  | { status: "loaded"; serverName: string; serverDescription?: string }
  | { status: "unavailable" };

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
    clientApi: {
      discoveryVersion: discovery.client_api.discovery_version,
      loginRequestEndpoint: discovery.client_api.login_request_endpoint,
      pollEndpointTemplate: discovery.client_api.poll_endpoint_template,
      consumeEndpointTemplate: discovery.client_api.consume_endpoint_template,
      tokenType: discovery.client_api.token_type,
    },
  };
}

export function ConnectServerScreen({ selectedProfileId, onSelectedProfileIdChange, onProfilesChanged }: Props) {
  const [serverUrlInput, setServerUrlInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presets, setPresets] = useState<ServerPreset[]>([]);
  const [selectedPresetUrl, setSelectedPresetUrl] = useState<string | null>(null);
  const [presetIdentities, setPresetIdentities] = useState<Record<string, PresetIdentity>>({});

  useEffect(() => {
    let active = true;
    void loadServerPresets().then((loaded) => {
      if (!active) return;
      setPresets(loaded);
      setPresetIdentities(Object.fromEntries(loaded.map((preset) => [preset.url, { status: "loading" }])));
      for (const preset of loaded) {
        void verifySecondPassServer(preset.url).then(
          ({ discovery }) => {
            if (!active) return;
            setPresetIdentities((current) => ({
              ...current,
              [preset.url]: {
                status: "loaded",
                serverName: discovery.server_name,
                serverDescription: discovery.server_description,
              },
            }));
          },
          () => {
            if (!active) return;
            setPresetIdentities((current) => ({ ...current, [preset.url]: { status: "unavailable" } }));
          },
        );
      }
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

      const label = summary.serverName || serverBaseUrl;

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
        {presets.length > 0 ? (
          <div className="serverPresets">
            {presets.map((preset, index) => {
              const identity = presetIdentities[preset.url] ?? { status: "loading" };
              return (
                <div
                  className={`serverPresetCard${selectedPresetUrl === preset.url ? " serverPresetCardSelected" : ""}`}
                  key={`${preset.url}:${index}`}
                >
                  <button
                    className="serverPresetCardAction"
                    type="button"
                    aria-label={`Use server ${identity.status === "loaded" ? identity.serverName : preset.url}`}
                    aria-pressed={selectedPresetUrl === preset.url}
                    onClick={() => {
                      setSelectedPresetUrl(preset.url);
                      setServerUrlInput(preset.url);
                    }}
                  />
                  <div className="serverPresetContent">
                    <strong className="serverPresetName">
                      {identity.status === "loaded" ? identity.serverName : preset.url}
                    </strong>
                    {identity.status === "loaded" ? <span className="muted mono">{preset.url}</span> : null}
                  </div>
                  <div className="serverPresetDescription" aria-live="polite">
                    {identity.status === "loading" ? <span className="muted">Loading server details...</span> : null}
                    {identity.status === "loaded" ? (
                      <ServerRichText
                        value={identity.serverDescription}
                        className="muted"
                        emptyFallback={<span>No server description provided.</span>}
                      />
                    ) : null}
                    {identity.status === "unavailable" ? (
                      <span className="muted">Server Unreachable</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
        <label className="field">
          <span className="fieldLabel">Server URL</span>
          <input
            className="input"
            value={serverUrlInput}
            onChange={(e) => {
              setSelectedPresetUrl(null);
              setServerUrlInput(e.target.value);
            }}
            placeholder="http://localhost:8000"
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
          <div className="fieldHelp muted">Examples: localhost:8000, http://localhost:8000/ibrary</div>
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
