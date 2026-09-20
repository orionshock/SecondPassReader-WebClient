import { useEffect, useRef, useState } from "react";
import type { CurrentUser } from "@secondpass/client";
import type { ActiveConnection } from "../../storage/ActiveConnection.Store";
import { debugWarn } from "../../lib/debug/DebugLogger.Diagnostics";
import { verifyConnection } from "./ConnectionVerification.Controller";

type Props = {
  connection: ActiveConnection | null;
  onConnectionChanged?: () => void;
  autoVerify?: boolean;
};

type State =
  | { phase: "idle" }
  | { phase: "verifying" }
  | { phase: "success"; me: CurrentUser }
  | { phase: "error"; message: string };

export function ClientApiVerification({ connection, onConnectionChanged, autoVerify }: Props) {
  const [state, setState] = useState<State>({ phase: "idle" });
  const autoVerifyAttemptedRef = useRef<string | null>(null);

  const verificationIdentity = connection
    ? JSON.stringify([connection.id, connection.serverId, connection.serverBaseUrl, connection.accessToken, connection.authenticationState])
    : null;

  useEffect(() => {
    if (!autoVerify) return;
    if (!connection) return;
    if (!connection.accessToken) return;
    if (!connection.serverId) return;
    if (connection.verifiedAt && connection.authenticationState !== "verifying-repair") return;
    if (autoVerifyAttemptedRef.current === verificationIdentity) return;
    autoVerifyAttemptedRef.current = verificationIdentity;
    void verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoVerify, verificationIdentity]);

  async function verify() {
    if (!connection) return;
    if (!connection.serverId) {
      setState({ phase: "error", message: "Library details are incomplete. Connect again." });
      return;
    }
    if (!connection.accessToken) {
      setState({ phase: "error", message: "This connection isn't authorized yet." });
      return;
    }

    setState({ phase: "verifying" });
    const result = await verifyConnection({ connection });
    if (result.status === "stale") return;
    if (result.status === "verified") {
      onConnectionChanged?.();
      setState({ phase: "success", me: result.currentUser });
      return;
    }
    if (result.status === "repair-cleanup-failed") {
      debugWarn("reader", "previous account data could not be removed after connection repair", {
        previousProfileId: result.previousProfileId,
        verifiedProfileId: result.verifiedProfileId,
      });
      setState({
        phase: "error",
        message: "The connection was verified, but the previous account's offline data couldn't be removed. Try again.",
      });
      return;
    }
    if (result.status === "server-identity-mismatch") {
      setState({ phase: "error", message: "This route returned a different Library server ID. Check the Library URL." });
      return;
    }
    if (result.status === "authorization-failed") {
      if (connection.authenticationState === "verifying-repair" && result.authenticationRejected) {
        onConnectionChanged?.();
      }
      setState({
        phase: "error",
        message: result.authenticationRejected
          ? "Second Pass Library rejected this connection. Repair it and try again."
          : "Second Pass Library did not allow this account to connect.",
      });
      return;
    }
    debugWarn("reader", "connection verification did not complete", { error: result.error });
    setState({ phase: "error", message: "Couldn't verify the connection. Try again." });
  }

  if (!connection) {
    return (
      <section className="panel">
        <h2 className="panelTitle">Verify connection</h2>
        <p className="muted">Connect to Second Pass Library first.</p>
      </section>
    );
  }

  if (!connection.accessToken) {
    return (
      <section className="panel">
        <h2 className="panelTitle">Verify connection</h2>
        <p className="muted">Library is not linked yet.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2 className="panelTitle">Verify connection</h2>

      {connection.verifiedAt && connection.verifiedUser && !connection.authenticationState ? (
        <div className="discoveryBox">
          <div>
            <span className="muted">Status:</span> <span className="pill pillOk">verified</span>
          </div>
          <div>
            <span className="muted">User:</span> <span className="mono">{connection.verifiedUser.username}</span>
          </div>
          {connection.verifiedUser.email ? (
            <div>
              <span className="muted">Email:</span> {connection.verifiedUser.email}
            </div>
          ) : null}
          <div>
            <span className="muted">Verified at:</span> {connection.verifiedAt}
          </div>
        </div>
      ) : (
        <p className="muted">Not verified yet.</p>
      )}

      {connection.mustChangePassword ? (
        <p className="warningText">
          Change this account's password in Second Pass Library, then verify again.
        </p>
      ) : null}

      <div className="formActions">
        <button
          type="button"
          className="button buttonPrimary"
          onClick={() => void verify()}
          disabled={state.phase === "verifying"}
        >
          {state.phase === "verifying" ? `Verifying${"\u2026"}` : "Verify connection"}
        </button>
      </div>

      {state.phase === "error" ? <p className="errorText">{state.message}</p> : null}
      {state.phase === "success" ? (
        <p>
          Connected as <span className="mono">{state.me.username}</span>
        </p>
      ) : null}
    </section>
  );
}
