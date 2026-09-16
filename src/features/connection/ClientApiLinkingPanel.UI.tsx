import { useEffect, useMemo, useRef, useState } from "react";
import { createSecondPassClient } from "@secondpass/client";
import type { ClientApiLoginRequestResponse, SecondPassDiscovery } from "@secondpass/client";
import { MaterialIcon } from "../../components/MaterialIcon.UI";
import { ServerRichText } from "../../components/ServerRichText.Renderer";
import {
  beginActiveConnectionPublication,
  publishActiveConnectionResult,
  saveActiveConnection,
  type ActiveConnection,
} from "../../storage/ActiveConnection.Store";
import { isConnectionLinked } from "./ConnectionStatus.Presenter";
import { buildDefaultDeviceName } from "./DefaultDeviceName.Presenter";
import { getPairingErrorMessage, runPairingAttempt } from "./PairingFlow.Controller";

type Props = {
  connection: ActiveConnection | null;
  onConnectionChanged?: () => void;
  onCancel?: () => "completed" | "cancelled" | "failed" | Promise<"completed" | "cancelled" | "failed">;
};

type LinkingState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "waiting"; loginRequest: ClientApiLoginRequestResponse }
  | { phase: "cancelling" }
  | { phase: "success" }
  | { phase: "error"; message: string };

function toDiscovery(connection: ActiveConnection): SecondPassDiscovery | null {
  if (!connection.apiBaseUrl || !connection.serverName || !connection.clientApi) return null;
  return {
    server_name: connection.serverName,
    server_description: connection.serverDescription,
    server_version: connection.serverVersion,
    server_release: connection.serverRelease,
    server_release_date: connection.serverReleaseDate,
    api_base_url: connection.apiBaseUrl,
    client_api: {
      discovery_version: connection.clientApi.discoveryVersion,
      login_request_endpoint: connection.clientApi.loginRequestEndpoint,
      poll_endpoint_template: connection.clientApi.pollEndpointTemplate,
      consume_endpoint_template: connection.clientApi.consumeEndpointTemplate,
      token_type: connection.clientApi.tokenType,
    },
  };
}

export function ClientApiLinking({ connection, onConnectionChanged, onCancel }: Props) {
  const [state, setState] = useState<LinkingState>({ phase: "idle" });
  const [nextPollAt, setNextPollAt] = useState<number | null>(null);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [clientName, setClientName] = useState<string>(() => buildDefaultDeviceName());
  const abortRef = useRef<AbortController | null>(null);

  const discovery = useMemo(() => (connection ? toDiscovery(connection) : null), [connection]);
  const repairing = connection?.authenticationState === "repair-required";

  useEffect(() => {
    if (!connection) return;
    setClientName(connection.clientSessionName ?? buildDefaultDeviceName());
  }, [connection?.id]);

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
    if (!connection) return;
    if (!discovery) {
      setState({ phase: "error", message: "Library details are incomplete. Connect again." });
      return;
    }

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    const publication = beginActiveConnectionPublication(connection);
    if (!publication) return;

    setNextPollAt(null);
    setState({ phase: "starting" });

    try {
      const spl = createSecondPassClient({ apiBaseUrl: connection.apiBaseUrl ?? "" });
      await runPairingAttempt({
        spl,
        discovery,
        clientName: clientName.trim(),
        signal: abort.signal,
        onLoginRequest: (loginRequest) => {
          publishActiveConnectionResult(publication, () => setState({ phase: "waiting", loginRequest }));
        },
        onPollScheduled: (nextAt) => {
          publishActiveConnectionResult(publication, () => setNextPollAt(nextAt));
        },
        onConsumed: (consumed) => {
          publishActiveConnectionResult(publication, () => {
            const now = new Date().toISOString();
            const updated: ActiveConnection = {
              ...connection,
              accessToken: consumed.accessToken,
              tokenType: consumed.tokenType,
              clientSessionId: consumed.clientSession.id,
              clientSessionName: consumed.clientSession.name || clientName.trim() || connection.clientSessionName,
              linkedAt: now,
              lastUsedAt: now,
              authenticationState: connection.authenticationState === "repair-required" ? "verifying-repair" : connection.authenticationState,
            };
            saveActiveConnection(updated);
            onConnectionChanged?.();
            setNextPollAt(null);
            setState({ phase: "success" });
          });
        },
      });
    } catch (e) {
      if (abort.signal.aborted) return;
      publishActiveConnectionResult(publication, () => {
        setNextPollAt(null);
        setState({ phase: "error", message: getPairingErrorMessage(e) });
      });
    }
  }

  function resetLocal() {
    abortRef.current?.abort();
    setNextPollAt(null);
    setState({ phase: "idle" });
  }

  async function cancel() {
    abortRef.current?.abort();
    if (!onCancel) return;
    setState({ phase: "cancelling" });
    const result = await onCancel();
    if (result === "cancelled") {
      setState({ phase: "idle" });
    } else if (result === "failed") {
      setState({
        phase: "error",
        message: "Offline data couldn't be removed. Try signing out again.",
      });
    }
  }

  const secondsUntilNextPoll =
    nextPollAt === null ? null : Math.max(0, Math.ceil((nextPollAt - countdownNow) / 1000));

  if (!connection) {
    return (
      <section className="panel pairScreen">
        <h1 className="pairTitle">Connect to Second Pass Library</h1>
        <p className="muted">Connect to Second Pass Library first.</p>
      </section>
    );
  }

  return (
    <section className="panel pairScreen">
      <div className="pairHeader">
        <h1 className="pairTitle">{repairing ? "Repair connection" : "Connect to Second Pass Library"}</h1>
        <div className="pairLibraryName">{connection.serverName ?? connection.label}</div>
        <ServerRichText value={connection.serverDescription} className="pairLibraryDescription" />
        <div className="pairLibraryAddress">
          <span className="muted">at</span> <span className="mono">{connection.serverBaseUrl}</span>
        </div>
      </div>

      {!discovery ? (
        <p className="muted">Library details are incomplete. Connect again.</p>
      ) : null}

      <div className="pairDivider" />

      <div className="pairBrowserSection">
        <label className="field">
          <span className="pairSectionTitle">Name this browser</span>
          <input
            className="input"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder={"Second Pass Reader \u00b7 Browser"}
            disabled={state.phase === "starting" || state.phase === "waiting"}
          />
          <span className="fieldHelp muted">This name identifies the browser in your Second Pass Library account.</span>
        </label>

        <p className="pairStatus muted" aria-live="polite">
          {isConnectionLinked(connection)
            ? "Linked."
            : state.phase === "starting"
              ? "Requesting approval..."
              : state.phase === "waiting"
                ? "Waiting for approval..."
                : state.phase === "success"
                  ? "Linked."
                  : "Ready to connect."}
        </p>

        <div className="formActions pairActions">
          <button
            type="button"
            className="button"
            onClick={() => void cancel()}
            disabled={state.phase === "cancelling"}
          >
            {state.phase === "cancelling" ? `Removing${"\u2026"}` : repairing ? "Sign out locally" : "Cancel"}
          </button>
          <button
            type="button"
            className="button buttonPrimary"
            onClick={() => void startLinking()}
            disabled={!discovery || state.phase === "starting" || state.phase === "waiting"}
          >
            <MaterialIcon name="link" />
            {state.phase === "starting"
              ? "Requesting..."
              : state.phase === "waiting"
                ? "Waiting..."
                : repairing ? "Repair connection" : "Request approval"}
          </button>
        </div>
      </div>

      {state.phase === "waiting" ? (
        <section className="linkingBox pairPendingPanel" aria-labelledby="pair-pending-title">
          <div>
            <h2 className="pairPendingTitle" id="pair-pending-title">Waiting for approval</h2>
            <p className="pairPendingInstruction">Use this code to approve this browser in Second Pass Library:</p>
          </div>

          <div className="pairApprovalCode mono">{state.loginRequest.code}</div>

          <div className="formActions pairPendingActions">
            <a
              className="button buttonPrimary pairExternalLink"
              href={state.loginRequest.authorizeUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open approval page
              <MaterialIcon name="open_in_new" />
            </a>
          </div>

          <div className="pairWaitingStatus muted" aria-live="polite">
            <span className="pairWaitingDot" aria-hidden="true" />
            <span>
              {"Waiting for approval..."}
              {secondsUntilNextPoll === null
                ? " Checking now."
                : ` Next check in ${secondsUntilNextPoll} seconds.`}
            </span>
          </div>
        </section>
      ) : null}

      {state.phase === "success" ? (
        <p>
          <span className="pill pillOk">Browser linked</span>
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
