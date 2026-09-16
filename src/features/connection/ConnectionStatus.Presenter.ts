import type { ActiveConnection } from "../../storage/ActiveConnection.Store";

export type ConnectionStatus = "not_configured" | "configured" | "linked" | "verified" | "repair_required";

export function isConnectionLinked(connection: ActiveConnection | null | undefined): boolean {
  return Boolean(connection?.accessToken && connection.authenticationState !== "repair-required");
}

export function isConnectionVerified(connection: ActiveConnection | null | undefined): boolean {
  return Boolean(connection?.verifiedAt && !connection.authenticationState);
}

export function getConnectionStatus(connection: ActiveConnection | null | undefined): ConnectionStatus {
  if (!connection) return "not_configured";
  if (connection.authenticationState === "repair-required" || connection.authenticationState === "verifying-repair") {
    return "repair_required";
  }
  if (!isConnectionLinked(connection)) return "configured";
  if (!isConnectionVerified(connection)) return "linked";
  return "verified";
}

export function getConnectionStatusLabel(status: ConnectionStatus): string {
  switch (status) {
    case "not_configured":
      return "Not connected";
    case "configured":
      return "Approval required";
    case "linked":
      return "Verification required";
    case "verified":
      return "Connected";
    case "repair_required":
      return "Repair required";
  }
}
