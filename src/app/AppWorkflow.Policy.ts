import type { ActiveConnection } from "../storage/ActiveConnection.Store";

export type AppWorkflowStep = "connect_server" | "pair_device" | "verify_connection" | "library_home";

export function getAppWorkflowStep(connection: ActiveConnection | null | undefined): AppWorkflowStep {
  if (!connection) return "connect_server";
  if (!connection.serverId) return "connect_server";
  if (connection.authenticationState === "repair-required") return "pair_device";
  if (connection.authenticationState === "verifying-repair") return "verify_connection";
  if (!connection.accessToken) return "pair_device";
  if (!connection.verifiedAt) return "verify_connection";
  return "library_home";
}
