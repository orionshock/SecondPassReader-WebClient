import { useEffect, useMemo, useRef, useState } from "react";
import { SecondPassApiClient } from "@secondpass/client";
import type { ClientApiLoginRequestResponse, ClientApiPollResponse, SecondPassDiscovery } from "@secondpass/client";
import { getConnectionProfile, saveConnectionProfile, type ConnectionProfile } from "../../storage/connectionProfiles";
import { isProfileLinked } from "./connectionStatus";

type Props = {
  selectedProfileId?: string | null;
  onProfilesChanged?: () => void;
  profilesVersion?: number;
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

export function ClientApiLinking({ selectedProfileId, onProfilesChanged, profilesVersion }: Props) {
  const [state, setState] = useState<LinkingState>({ phase: "idle" });
  const [pollDetail, setPollDetail] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string>("Second Pass Reader");
  const abortRef = useRef<AbortController | null>(null);

  const profile = useMemo(() => {
    if (!selectedProfileId) return null;
    void profilesVersion;
    return getConnectionProfile(selectedProfileId) ?? null;
  }, [selectedProfileId, profilesVersion, state.phase]);

  const discovery = useMemo(() => (profile ? toDiscovery(profile) : null), [profile]);

  useEffect(() => {
    if (!profile) return;
    setClientName(profile.clientSessionName ?? profile.label ?? "Second Pass Reader");
  }, [profile?.id]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function startLinking() {
    if (!profile) return;
    if (!discovery) {
      setState({ phase: "error", message: "Run discovery first (Test discovery) so client API endpoints are known." });
      return;
    }

    setPollDetail(null);
    setState({ phase: "starting" });

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const api = new SecondPassApiClient({ serverBaseUrl: profile.serverBaseUrl });
      const loginRequest = await api.createLoginRequest(discovery, {
        clientName: clientName.trim() || "Second Pass Reader",
        clientType: "reader",
      });
      setState({ phase: "waiting", loginRequest, pollStatus: "pending" });

      await pollUntilDone({
        api,
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
      <section className="panel">
        <h2 className="panelTitle">Client API linking</h2>
        <p className="muted">Select a connection profile to start linking.</p>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="panel">
        <h2 className="panelTitle">Client API linking</h2>
        <p className="muted">Selected profile not found. Re-select a profile.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2 className="panelTitle">Client API linking</h2>

      {!discovery ? (
        <p className="muted">
          Client API endpoints are unknown for this profile. Run <strong>Test discovery</strong> first.
        </p>
      ) : null}

      <label className="field">
        <span className="fieldLabel">Device name</span>
        <input
          className="input"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          placeholder="Second Pass Reader"
          disabled={state.phase === "starting" || state.phase === "waiting"}
        />
      </label>

      {isProfileLinked(profile) ? (
        <div className="discoveryBox">
          <div>
            <span className="muted">Status:</span> <span className="pill pillOk">linked</span>
          </div>
          <div>
            <span className="muted">Linked at:</span> {profile.linkedAt ?? "—"}
          </div>
          <div>
            <span className="muted">Bearer token:</span> stored
          </div>
          <div>
            <span className="muted">Client session:</span> <span className="mono">{profile.clientSessionId ?? "—"}</span>
          </div>
          {profile.clientSessionName ? (
            <div>
              <span className="muted">Client name:</span> {profile.clientSessionName}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="muted">Not linked yet.</p>
      )}

      <div className="formActions">
        <button
          type="button"
          className="button buttonPrimary"
          onClick={() => void startLinking()}
          disabled={!discovery || state.phase === "starting" || state.phase === "waiting"}
        >
          {state.phase === "starting" ? `Starting${"\u2026"}` : state.phase === "waiting" ? `Linking${"\u2026"}` : "Start linking"}
        </button>
        {state.phase !== "idle" ? (
          <button type="button" className="button" onClick={resetLocal}>
            Reset local state
          </button>
        ) : null}
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
  api: SecondPassApiClient;
  loginRequest: ClientApiLoginRequestResponse;
  signal: AbortSignal;
  onUpdate: (status: ClientApiPollResponse["status"], detail?: string) => void;
  onApproved: (approved: Extract<ClientApiPollResponse, { status: "approved" }>) => void;
}) {
  const intervalSeconds = Math.max(1, Math.floor(input.loginRequest.interval ?? 3));

  while (!input.signal.aborted) {
    const result = await input.api.pollLoginRequest(input.loginRequest.poll_url);
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
