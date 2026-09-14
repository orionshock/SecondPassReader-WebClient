import { useEffect, useRef } from "react";
import type { AppRoute } from "./AppNavigation.Router";
import type { ConnectionProfile } from "../storage/ConnectionProfiles.Store";
import { saveConnectionProfile } from "../storage/ConnectionProfiles.Store";
import { markConnectionRepairRequired } from "../features/connection/ConnectionRepair.State";

export function useAppConnectionRecoveryLifecycle(input: {
  route: AppRoute | null;
  profile: ConnectionProfile | null;
  authenticationRepairRequired: boolean;
  clearAuthorizationFailure: () => void;
  onProfileChanged: () => void;
}): void {
  const profileId = input.profile?.id ?? null;
  const connectionIdentityRef = useRef(`${profileId ?? ""}:${input.profile?.accessToken ?? ""}`);

  useEffect(() => {
    const nextIdentity = `${profileId ?? ""}:${input.profile?.accessToken ?? ""}`;
    if (connectionIdentityRef.current !== nextIdentity) input.clearAuthorizationFailure();
    connectionIdentityRef.current = nextIdentity;
  }, [input.clearAuthorizationFailure, input.profile?.accessToken, profileId]);

  useEffect(() => {
    if (input.route?.kind === "settings" && input.route.tab === "library-server") {
      input.clearAuthorizationFailure();
    }
  }, [input.clearAuthorizationFailure, input.route]);

  useEffect(() => {
    if (!input.authenticationRepairRequired || !input.profile) return;
    if (input.profile.authenticationState === "repair-required") return;
    saveConnectionProfile(markConnectionRepairRequired(input.profile));
    input.onProfileChanged();
  }, [input.authenticationRepairRequired, input.onProfileChanged, input.profile]);
}
