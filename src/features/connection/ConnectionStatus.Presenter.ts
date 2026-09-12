import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";

export type ConnectionStatus = "not_configured" | "configured" | "linked" | "verified" | "repair_required";

export function isProfileLinked(profile: ConnectionProfile | null | undefined): boolean {
  return Boolean(profile?.accessToken && profile.authenticationState !== "repair-required");
}

export function isProfileVerified(profile: ConnectionProfile | null | undefined): boolean {
  return Boolean(profile?.verifiedAt && !profile.authenticationState);
}

export function getConnectionStatus(profile: ConnectionProfile | null | undefined): ConnectionStatus {
  if (!profile) return "not_configured";
  if (profile.authenticationState === "repair-required" || profile.authenticationState === "verifying-repair") {
    return "repair_required";
  }
  if (!isProfileLinked(profile)) return "configured";
  if (!isProfileVerified(profile)) return "linked";
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
