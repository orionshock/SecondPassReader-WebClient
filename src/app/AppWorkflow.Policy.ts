import type { ConnectionProfile } from "../storage/connectionProfiles";

export type AppWorkflowStep = "connect_server" | "pair_device" | "verify_connection" | "library_home";

export function getAppWorkflowStep(profile: ConnectionProfile | null | undefined): AppWorkflowStep {
  if (!profile) return "connect_server";
  if (!profile.apiBaseUrl) return "connect_server";
  if (!profile.accessToken) return "pair_device";
  if (!profile.verifiedAt) return "verify_connection";
  return "library_home";
}
