import type { ConnectionProfile } from "../../storage/connectionProfiles";

export type ConnectionStatus = "not_configured" | "configured" | "linked" | "verified";

export function isProfileLinked(profile: ConnectionProfile | null | undefined): boolean {
  return Boolean(profile?.accessToken);
}

export function isProfileVerified(profile: ConnectionProfile | null | undefined): boolean {
  return Boolean(profile?.verifiedAt);
}

export function getConnectionStatus(profile: ConnectionProfile | null | undefined): ConnectionStatus {
  if (!profile) return "not_configured";
  if (!isProfileLinked(profile)) return "configured";
  if (!isProfileVerified(profile)) return "linked";
  return "verified";
}

export function getConnectionStatusLabel(status: ConnectionStatus): string {
  switch (status) {
    case "not_configured":
      return "not configured";
    case "configured":
      return "configured, not linked";
    case "linked":
      return "linked, not verified";
    case "verified":
      return "verified";
  }
}

