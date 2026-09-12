import { useEffect, useMemo, useRef, useState } from "react";
import type { CurrentUser } from "@secondpass/client";
import { getConnectionProfile, saveConnectionProfile, type ConnectionProfile } from "../../storage/ConnectionProfiles.Store";
import { createSplClientFromProfile } from "../../app/AppSplClient.Factory";
import { applyAuthenticatedContextToProfile } from "./ConnectionAccountProfile.Mapper";
import { finalizeConnectionRepair } from "./ConnectionRepair.Controller";
import { loadAuthenticatedContext } from "./AuthenticatedContext.Queries";
import { isAuthenticationRepairError, isAuthorizationError } from "../../app/AppUserFacingErrors.Mapper";
import { debugWarn } from "../../lib/debug/DebugLogger.Diagnostics";

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
      setState({ phase: "error", message: "Library details are incomplete. Connect again." });
      return;
    }
    if (!profile.accessToken) {
      setState({ phase: "error", message: "This connection isn't authorized yet." });
      return;
    }

    setState({ phase: "verifying" });
    try {
      const spl = createSplClientFromProfile(profile);
      const { currentUser, serverInfo } = await loadAuthenticatedContext(spl);

      const now = new Date().toISOString();
      const updated: ConnectionProfile = applyAuthenticatedContextToProfile(profile, currentUser, serverInfo, now);

      if (profile.authenticationState === "verifying-repair") {
        const result = await finalizeConnectionRepair({
          previous: profile,
          verified: updated,
          save: saveConnectionProfile,
        });
        if (result.status === "failed") {
          debugWarn("offline", "previous account data could not be removed after connection repair", {
            previousProfileId: profile.verifiedUser?.profileId,
            verifiedProfileId: updated.verifiedUser?.profileId,
          });
          setState({
            phase: "error",
            message: "The connection was verified, but the previous account's offline data couldn't be removed. Try again.",
          });
          return;
        }
      } else {
        saveConnectionProfile(updated);
      }
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
            ? "Second Pass Library rejected this connection. Repair it and try again."
            : "Second Pass Library did not allow this account to connect.",
        });
        return;
      }
      debugWarn("reader", "connection verification did not complete", { error: e });
      setState({ phase: "error", message: "Couldn't verify the connection. Try again." });
    }
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
