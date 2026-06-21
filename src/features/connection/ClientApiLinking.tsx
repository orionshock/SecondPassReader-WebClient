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
  | { phase: "waiting"; loginRequest: ClientApiLoginRequestResponse }
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
  const [nextPollAt, setNextPollAt] = useState<number | null>(null);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
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

  useEffect(() => {
    if (state.phase !== "waiting" || nextPollAt === null) return;
    setCountdownNow(Date.now());
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [nextPollAt, state.phase]);

  async function startLinking() {
    if (!profile) return;
    if (!discovery) {
      setState({ phase: "error", message: "Connect a library first so client API endpoints are known." });
      return;
    }

    setNextPollAt(null);
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
      setState({ phase: "waiting", loginRequest });

      await pollUntilDone({
        spl,
        loginRequest,
        signal: abort.signal,
        onUpdate: (nextAt) => {
          setNextPollAt(nextAt);
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
          setNextPollAt(null);
          setState({ phase: "success" });
        },
      });
    } catch (e) {
      if (abort.signal.aborted) return;
      setNextPollAt(null);
      setState({ phase: "error", message: e instanceof Error ? e.message : "Linking failed." });
    }
  }

  function resetLocal() {
    abortRef.current?.abort();
    setNextPollAt(null);
    setState({ phase: "idle" });
  }

  const secondsUntilNextPoll =
    nextPollAt === null ? null : Math.max(0, Math.ceil((nextPollAt - countdownNow) / 1000));

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
        <section className="linkingBox pairPendingPanel" aria-labelledby="pair-pending-title">
          <div>
            <h2 className="pairPendingTitle" id="pair-pending-title">Waiting for approval</h2>
            <p className="pairPendingInstruction">Use this code to approve this browser in your library:</p>
          </div>

          <div className="pairApprovalCode mono">{state.loginRequest.code}</div>

          <div className="formActions pairPendingActions">
            <a
              className="button buttonPrimary pairExternalLink"
              href={state.loginRequest.authorize_url}
              target="_blank"
              rel="noreferrer"
            >
              Open authorization page
              <MaterialIcon name="open_in_new" />
            </a>
          </div>

          <div className="pairWaitingStatus muted" aria-live="polite">
            <span className="pairWaitingDot" aria-hidden="true" />
            <span>
              {`Waiting for your library to approve this browser${"\u2026"}`}
              {secondsUntilNextPoll === null
                ? " Checking now."
                : ` Next check in ${secondsUntilNextPoll}s.`}
            </span>
          </div>
        </section>
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
  onUpdate: (nextPollAt: number) => void;
  onApproved: (approved: Extract<ClientApiPollResponse, { status: "approved" }>) => void;
}) {
  const intervalSeconds = Math.max(1, Math.floor(input.loginRequest.interval ?? 3));

  while (!input.signal.aborted) {
    const result = await input.spl.server.pollLoginRequest(input.loginRequest.poll_url);

    if (result.status === "approved") {
      input.onApproved(result);
      return;
    }
    if (result.status === "denied" || result.status === "expired" || result.status === "consumed") {
      throw new Error(`Linking ended: ${result.status}`);
    }

    input.onUpdate(Date.now() + intervalSeconds * 1000);
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
