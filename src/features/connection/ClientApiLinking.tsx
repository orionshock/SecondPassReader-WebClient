import { useEffect, useMemo, useRef, useState } from "react";
import { createSecondPassClient, type SecondPassClient } from "@secondpass/client";
import type { ClientApiLoginRequestResponse, ClientApiPollResponse, SecondPassDiscovery } from "@secondpass/client";
import { MaterialIcon } from "../../components/MaterialIcon";
import { getConnectionProfile, saveConnectionProfile, type ConnectionProfile } from "../../storage/connectionProfiles";
import { isProfileLinked } from "./connectionStatus";
import { buildDefaultDeviceName } from "./defaultDeviceName";

type Props = {
  selectedProfileId?: string | null;
  onProfilesChanged?: () => void;
  profilesVersion?: number;
  onCancel?: () => void;
};

type LinkingState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "waiting"; loginRequest: ClientApiLoginRequestResponse; pollStatus: ClientApiPollResponse["status"] }
  | { phase: "success" }
  | { phase: "error"; message: string };

function toDiscovery(profile: ConnectionProfile): SecondPassDiscovery | null {
  if (!profile.apiBaseUrl || !profile.serverName || !profile.clientApi) return null;
  return {
    server_name: profile.serverName,
    api_base_url: profile.apiBaseUrl,
    client_api: {
      discovery_version: profile.clientApi.discoveryVersion,
      discovery_endpoint: profile.clientApi.discoveryEndpoint,
      login_request_endpoint: profile.clientApi.loginRequestEndpoint,
      authorize_url: profile.clientApi.authorizeUrl,
      poll_endpoint_template: profile.clientApi.pollEndpointTemplate,
      token_type: "Bearer",
    },
  };
}

export function ClientApiLinking({ selectedProfileId, onProfilesChanged, profilesVersion, onCancel }: Props) {
  const [state, setState] = useState<LinkingState>({ phase: "idle" });
  const [pollDetail, setPollDetail] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string>(() => buildDefaultDeviceName());
  const abortRef = useRef<AbortController | null>(null);

  const profile = useMemo(() => {
    if (!selectedProfileId) return null;
    void profilesVersion;
    return getConnectionProfile(selectedProfileId) ?? null;
  }, [selectedProfileId, profilesVersion, state.phase]);

  const discovery = useMemo(() => (profile ? toDiscovery(profile) : null), [profile]);

  useEffect(() => {
    if (!profile) return;
    setClientName(profile.clientSessionName ?? buildDefaultDeviceName());
  }, [profile?.id]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function startLinking() {
    if (!profile) return;
    if (!discovery) {
      setState({ phase: "error", message: "Connect a library first so client API endpoints are known." });
      return;
    }

    setPollDetail(null);
    setState({ phase: "starting" });

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const spl = createSecondPassClient({ apiBaseUrl: profile.apiBaseUrl ?? "" });
      const loginRequest = await spl.server.createLoginRequest(discovery, {
        clientName: clientName.trim(),
        clientType: "reader",
      });
      setState({ phase: "waiting", loginRequest, pollStatus: "pending" });

      await pollUntilDone({
        spl,
        loginRequest,
        signal: abort.signal,
        onUpdate: (status, detail) => {
          setPollDetail(detail ?? null);
          setState((prev) => (prev.phase === "waiting" ? { ...prev, pollStatus: status } : prev));
        },
        onApproved: (approved) => {
          const now = new Date().toISOString();
          const updated: ConnectionProfile = {
            ...profile,
            accessToken: approved.access_token,
            tokenType: approved.token_type,
            clientSessionId: approved.client_session.id,
            clientSessionName: approved.client_session.name ?? (clientName.trim() || profile.clientSessionName),
            linkedAt: now,
            lastUsedAt: now,
          };
          saveConnectionProfile(updated);
          onProfilesChanged?.();
          setState({ phase: "success" });
        },
      });
    } catch (e) {
      if (abort.signal.aborted) return;
      setState({ phase: "error", message: e instanceof Error ? e.message : "Linking failed." });
    }
  }

  function resetLocal() {
    abortRef.current?.abort();
    setPollDetail(null);
    setState({ phase: "idle" });
  }

  if (!selectedProfileId) {
    return (
      <section className="panel pairScreen">
        <h1 className="pairTitle">Connect to SecondPass Library</h1>
        <p className="muted">Connect a library to start linking.</p>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="panel pairScreen">
        <h1 className="pairTitle">Connect to SecondPass Library</h1>
        <p className="muted">Connected library not found. Connect the library again.</p>
      </section>
    );
  }

  return (
    <section className="panel pairScreen">
      <div className="pairHeader">
        <h1 className="pairTitle">Connect to SecondPass Library</h1>
        <div className="pairLibraryName">{profile.serverName ?? profile.label}</div>
        {profile.serverDescription ? <p className="pairLibraryDescription">{profile.serverDescription}</p> : null}
        <div className="pairLibraryAddress">
          <span className="muted">at</span> <span className="mono">{profile.serverBaseUrl}</span>
        </div>
      </div>

      {!discovery ? (
        <p className="muted">Client API endpoints are unknown for this library. Connect the library again.</p>
      ) : null}

      <div className="pairDivider" />

      <div className="pairBrowserSection">
        <label className="field">
          <span className="pairSectionTitle">Name this browser</span>
          <input
            className="input"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder={"SecondPass Reader \u00b7 Browser"}
            disabled={state.phase === "starting" || state.phase === "waiting"}
          />
          <span className="fieldHelp muted">This is how this browser will appear in your library profile.</span>
        </label>

        <p className="pairStatus muted" aria-live="polite">
          {isProfileLinked(profile)
            ? "Linked."
            : state.phase === "starting"
              ? "Starting the linking request..."
              : state.phase === "waiting"
                ? "Waiting for approval in your library..."
                : state.phase === "success"
                  ? "Linked."
                  : "Not linked yet."}
        </p>

        <div className="formActions pairActions">
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="button buttonPrimary"
            onClick={() => void startLinking()}
            disabled={!discovery || state.phase === "starting" || state.phase === "waiting"}
          >
            <MaterialIcon name="link" />
            {state.phase === "starting" ? `Starting${"\u2026"}` : state.phase === "waiting" ? `Linking${"\u2026"}` : "Start linking"}
          </button>
        </div>
      </div>

      {state.phase === "waiting" ? (
        <div className="linkingBox">
          <div className="selectedRow">
            <span className="muted">Code:</span> <span className="mono">{state.loginRequest.code}</span>
          </div>
          <div className="selectedRow">
            <span className="muted">Authorize URL:</span>{" "}
            <a href={state.loginRequest.authorize_url} target="_blank" rel="noreferrer">
              Open authorization page
            </a>
          </div>
          <div className="selectedRow">
            <span className="muted">Polling status:</span>{" "}
            <span className={state.pollStatus === "pending" ? "pill pillIdle" : "pill pillWarn"}>
              {state.pollStatus}
            </span>
          </div>
          {pollDetail ? <div className="muted">{pollDetail}</div> : null}
          <div>
            <button type="button" className="button buttonCompact" onClick={resetLocal}>
              Stop waiting
            </button>
          </div>
        </div>
      ) : null}

      {state.phase === "success" ? (
        <p>
          <span className="pill pillOk">Client linked</span>
        </p>
      ) : null}

      {state.phase === "error" ? (
        <div>
          <p className="errorText">{state.message}</p>
          <button type="button" className="button" onClick={resetLocal}>
            Retry
          </button>
        </div>
      ) : null}

    </section>
  );
}

async function pollUntilDone(input: {
  spl: SecondPassClient;
  loginRequest: ClientApiLoginRequestResponse;
  signal: AbortSignal;
  onUpdate: (status: ClientApiPollResponse["status"], detail?: string) => void;
  onApproved: (approved: Extract<ClientApiPollResponse, { status: "approved" }>) => void;
}) {
  const intervalSeconds = Math.max(1, Math.floor(input.loginRequest.interval ?? 3));

  while (!input.signal.aborted) {
    const result = await input.spl.server.pollLoginRequest(input.loginRequest.poll_url);
    input.onUpdate(result.status, `Polling every ${intervalSeconds}s${"\u2026"}`);

    if (result.status === "approved") {
      input.onApproved(result);
      return;
    }
    if (result.status === "denied" || result.status === "expired" || result.status === "consumed") {
      throw new Error(`Linking ended: ${result.status}`);
    }

    await sleep(intervalSeconds * 1000, input.signal);
  }
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }

    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort);
  });
}
