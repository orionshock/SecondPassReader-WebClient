import { useEffect, useMemo, useRef, useState } from "react";
import type { CurrentUser } from "@secondpass/client";
import { getConnectionProfile } from "../../storage/ConnectionProfiles.Store";
import { debugWarn } from "../../lib/debug/DebugLogger.Diagnostics";
import { verifyConnection } from "./ConnectionVerification.Controller";

type Props = {
  selectedProfileId?: string | null;
  profilesVersion?: number;
  onProfilesChanged?: () => void;
  autoVerify?: boolean;
};

type State =
  | { phase: "idle" }
  | { phase: "verifying" }
  | { phase: "success"; me: CurrentUser }
  | { phase: "error"; message: string };

export function ClientApiVerification({ selectedProfileId, profilesVersion, onProfilesChanged, autoVerify }: Props) {
  const [state, setState] = useState<State>({ phase: "idle" });
  const autoVerifyAttemptedRef = useRef<string | null>(null);

  const profile = useMemo(() => {
    if (!selectedProfileId) return null;
    void profilesVersion;
    return getConnectionProfile(selectedProfileId) ?? null;
  }, [selectedProfileId, profilesVersion]);
  const verificationIdentity = profile
    ? JSON.stringify([profile.id, profile.serverBaseUrl, profile.accessToken, profile.authenticationState])
    : null;

  useEffect(() => {
    if (!autoVerify) return;
    if (!profile) return;
    if (!profile.accessToken) return;
    if (!profile.apiBaseUrl) return;
    if (profile.verifiedAt && profile.authenticationState !== "verifying-repair") return;
    if (autoVerifyAttemptedRef.current === verificationIdentity) return;
    autoVerifyAttemptedRef.current = verificationIdentity;
    void verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoVerify, verificationIdentity]);

  async function verify() {
    if (!profile) return;
    if (!profile.apiBaseUrl) {
      setState({ phase: "error", message: "Library details are incomplete. Connect again." });
      return;
    }
    if (!profile.accessToken) {
      setState({ phase: "error", message: "This connection isn't authorized yet." });
      return;
    }

    setState({ phase: "verifying" });
    const result = await verifyConnection({ profile });
    if (result.status === "stale") return;
    if (result.status === "verified") {
      onProfilesChanged?.();
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
    if (result.status === "authorization-failed") {
      if (profile.authenticationState === "verifying-repair" && result.authenticationRejected) {
        onProfilesChanged?.();
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

  if (!selectedProfileId) {
    return (
      <section className="panel">
        <h2 className="panelTitle">Verify connection</h2>
        <p className="muted">Connect to Second Pass Library first.</p>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="panel">
        <h2 className="panelTitle">Verify connection</h2>
        <p className="muted">This connection no longer exists. Connect again.</p>
      </section>
    );
  }

  if (!profile.accessToken) {
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

      {profile.verifiedAt && profile.verifiedUser && !profile.authenticationState ? (
        <div className="discoveryBox">
          <div>
            <span className="muted">Status:</span> <span className="pill pillOk">verified</span>
          </div>
          <div>
            <span className="muted">User:</span> <span className="mono">{profile.verifiedUser.username}</span>
          </div>
          {profile.verifiedUser.email ? (
            <div>
              <span className="muted">Email:</span> {profile.verifiedUser.email}
            </div>
          ) : null}
          <div>
            <span className="muted">Verified at:</span> {profile.verifiedAt}
          </div>
        </div>
      ) : (
        <p className="muted">Not verified yet.</p>
      )}

      {profile.mustChangePassword ? (
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
