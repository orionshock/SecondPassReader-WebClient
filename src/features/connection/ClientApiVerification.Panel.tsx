import { useEffect, useMemo, useRef, useState } from "react";
import type { CurrentUser } from "@secondpass/client";
import { getConnectionProfile, saveConnectionProfile, type ConnectionProfile } from "../../storage/ConnectionProfiles.Store";
import { createSplClientFromProfile } from "../../app/AppSplClient.Factory";
import { applyAuthenticatedContextToProfile } from "./ConnectionAccountProfile.Mapper";
import { loadAuthenticatedContext } from "./AuthenticatedContext.Queries";
import { isAuthenticationRepairError, isAuthorizationError } from "../../app/AppUserFacingErrors.Mapper";

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
  const autoVerifyAttemptedRef = useRef(false);

  const profile = useMemo(() => {
    if (!selectedProfileId) return null;
    void profilesVersion;
    return getConnectionProfile(selectedProfileId) ?? null;
  }, [selectedProfileId, profilesVersion]);

  useEffect(() => {
    if (!autoVerify) return;
    if (!profile) return;
    if (!profile.accessToken) return;
    if (!profile.apiBaseUrl) return;
    if (profile.verifiedAt && profile.authenticationState !== "verifying-repair") return;
    if (autoVerifyAttemptedRef.current) return;
    autoVerifyAttemptedRef.current = true;
    void verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoVerify, profile?.authenticationState, profile?.id]);

  async function verify() {
    if (!profile) return;
    if (!profile.apiBaseUrl) {
      setState({ phase: "error", message: "Missing apiBaseUrl. Run discovery first." });
      return;
    }
    if (!profile.accessToken) {
      setState({ phase: "error", message: "Library is not linked yet (no access token)." });
      return;
    }

    setState({ phase: "verifying" });
    try {
      const spl = createSplClientFromProfile(profile);
      const { currentUser, serverInfo } = await loadAuthenticatedContext(spl);

      const now = new Date().toISOString();
      const updated: ConnectionProfile = applyAuthenticatedContextToProfile(profile, currentUser, serverInfo, now);

      saveConnectionProfile(updated);
      onProfilesChanged?.();
      setState({ phase: "success", me: currentUser });
    } catch (e) {
      if (isAuthorizationError(e)) {
        const authenticationRejected = isAuthenticationRepairError(e);
        if (profile.authenticationState === "verifying-repair" && authenticationRejected) {
          saveConnectionProfile({ ...profile, authenticationState: "repair-required" });
          onProfilesChanged?.();
        }
        setState({
          phase: "error",
          message: authenticationRejected
            ? "These credentials were rejected. Repair the connection and verify again."
            : "The library server did not allow verification for this account.",
        });
        return;
      }
      setState({ phase: "error", message: e instanceof Error ? e.message : "Verification failed." });
    }
  }

  if (!selectedProfileId) {
    return (
      <section className="panel">
        <h2 className="panelTitle">Verify connection</h2>
        <p className="muted">Connect a library to verify.</p>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="panel">
        <h2 className="panelTitle">Verify connection</h2>
        <p className="muted">Connected library not found.</p>
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
          This account requires a password change. Update it in the server web UI, then verify again.
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
