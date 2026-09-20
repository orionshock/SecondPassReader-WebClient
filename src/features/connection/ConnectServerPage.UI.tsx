import { useEffect, useState } from "react";
import type { SecondPassDiscovery } from "@secondpass/client";
import { ServerRichText } from "../../components/ServerRichText.Renderer";
import {
  beginActiveConnectionPublication,
  getActiveConnection,
  publishActiveConnectionResult,
  saveActiveConnection,
  type ActiveConnection,
} from "../../storage/ActiveConnection.Store";
import { ConnectionSetupError, verifySecondPassServer } from "./ConnectionServer.Queries";
import { loadServerPresets, type ServerPreset } from "./ServerPresets.Queries";
import { debugWarn } from "../../lib/debug/DebugLogger.Diagnostics";

type Props = {
  onConnectionChanged: () => void;
};

type PresetIdentity =
  | { status: "loading" }
  | { status: "loaded"; serverName: string; serverDescription?: string }
  | { status: "unavailable" };

function newConnectionId() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyCrypto = crypto as any;
    if (typeof anyCrypto?.randomUUID === "function") return `cp_${anyCrypto.randomUUID()}`;
  } catch {}
  // This ID is a local routing key, not an authentication or offline namespace identity.
  return `cp_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function formatDiscoverySummary(discovery: SecondPassDiscovery) {
  return {
    serverId: discovery.serverId,
    serverName: discovery.server_name,
    serverDescription: discovery.server_description,
    serverVersion: discovery.server_version,
    serverReleaseDate: discovery.server_release_date,
    clientApi: {
      discoveryVersion: discovery.client_api.discovery_version,
      loginRequestEndpoint: discovery.client_api.login_request_endpoint,
      pollEndpointTemplate: discovery.client_api.poll_endpoint_template,
      consumeEndpointTemplate: discovery.client_api.consume_endpoint_template,
      tokenType: discovery.client_api.token_type,
    },
  };
}

export function ConnectServerScreen({ onConnectionChanged }: Props) {
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
    const existing = getActiveConnection();
    const publication = beginActiveConnectionPublication(existing);
    if (!publication) return;
    setError(null);
    setBusy(true);
    try {
      const { serverBaseUrl, discovery } = await verifySecondPassServer(serverUrlInput);
      const summary = formatDiscoverySummary(discovery);

      const now = new Date().toISOString();
      const label = summary.serverName || serverBaseUrl;

      const updated: ActiveConnection = {
        id: existing?.id ?? newConnectionId(),
        createdAt: existing?.createdAt ?? now,
        label,
        serverBaseUrl,
        serverId: summary.serverId,
        serverUrls: [],
        serverName: summary.serverName,
        serverDescription: summary.serverDescription,
        serverVersion: summary.serverVersion,
        serverReleaseDate: summary.serverReleaseDate,
        clientApi: summary.clientApi,
        lastUsedAt: now,
      };

      publishActiveConnectionResult(publication, () => {
        saveActiveConnection(updated);
        onConnectionChanged();
        setBusy(false);
      });
    } catch (e) {
      publishActiveConnectionResult(publication, () => {
        if (!(e instanceof ConnectionSetupError)) {
          debugWarn("reader", "Second Pass Library connection was not saved", { error: e });
        }
        setError(e instanceof ConnectionSetupError
          ? e.message
          : "Couldn't connect to Second Pass Library. Check the address and try again.");
        setBusy(false);
      });
    }
  }

  return (
    <section className="panel connectScreen">
      <h2 className="panelTitle">Connect to Second Pass Library</h2>

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
                    aria-label={`Select ${identity.status === "loaded" ? identity.serverName : preset.url}`}
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
                    {identity.status === "loading" ? <span className="muted">Loading library details...</span> : null}
                    {identity.status === "loaded" ? (
                      <ServerRichText
                        value={identity.serverDescription}
                        className="muted"
                        emptyFallback={<span>No description provided.</span>}
                      />
                    ) : null}
                    {identity.status === "unavailable" ? (
                      <span className="muted">Library unavailable</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
        <label className="field">
          <span className="fieldLabel">Library URL</span>
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
          <div className="fieldHelp muted">Examples: localhost:8000, https://library.example.com</div>
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
