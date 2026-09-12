import { useCallback, useEffect, useRef } from "react";
import type { SecondPassClient } from "@secondpass/client";
import type { ConnectionProfile } from "../storage/ConnectionProfiles.Store";
import { saveConnectionProfile } from "../storage/ConnectionProfiles.Store";
import { applyAuthenticatedContextToProfile, hasCurrentAccountProfileChanged } from "../features/connection/ConnectionAccountProfile.Mapper";
import { loadAuthenticatedContext } from "../features/connection/AuthenticatedContext.Queries";
import type { AppWorkflowStep } from "./AppWorkflow.Policy";

export function useAppAuthenticatedContextController({
  workflowStep,
  profile,
  spl,
  clearAuthorizationFailure,
  reportAuthorizationFailure,
  onProfileChanged,
}: {
  workflowStep: AppWorkflowStep;
  profile: ConnectionProfile | null;
  spl: SecondPassClient | null;
  clearAuthorizationFailure: () => void;
  reportAuthorizationFailure: (error: unknown) => void;
  onProfileChanged: () => void;
}) {
  const lastCheckRef = useRef<Record<string, number>>({});

  const checkAuthenticatedContext = useCallback(async () => {
    // Keep verified user display fresh on page load and periodic focus changes.
    if (workflowStep !== "library_home") return;
    if (!profile?.id) return;
    if (!profile.apiBaseUrl || !profile.accessToken || !spl) return;

    const profileId = profile.id;
    const now = Date.now();
    const last = lastCheckRef.current[profileId] ?? 0;
    if (now - last < 60_000) return; // throttle (avoid spamming)
    lastCheckRef.current[profileId] = now;

    try {
      const { currentUser, serverInfo } = await loadAuthenticatedContext(spl);
      clearAuthorizationFailure();
      const nextProfile = applyAuthenticatedContextToProfile(
        profile,
        currentUser,
        serverInfo,
        new Date().toISOString(),
        { markVerified: false },
      );
      const changed = hasCurrentAccountProfileChanged(profile, nextProfile);

      if (!changed) return;

      saveConnectionProfile(nextProfile);
      onProfileChanged();
    } catch (error) {
      reportAuthorizationFailure(error);
      // Auth failure enters repair without destroying the last verified namespace.
    }
  }, [clearAuthorizationFailure, onProfileChanged, profile, reportAuthorizationFailure, spl, workflowStep]);

  useEffect(() => {
    void checkAuthenticatedContext();
  }, [checkAuthenticatedContext]);

  useEffect(() => {
    if (workflowStep !== "library_home") return;
    const onFocus = () => {
      void checkAuthenticatedContext();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [checkAuthenticatedContext, workflowStep]);
}
