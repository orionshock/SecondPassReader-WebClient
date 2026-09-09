import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";

export function markConnectionRepairRequired(profile: ConnectionProfile): ConnectionProfile {
  return { ...profile, authenticationState: "repair-required" };
}
