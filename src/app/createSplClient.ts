import { createSecondPassClient, type SecondPassClient } from "@secondpass/client";
import type { ConnectionProfile } from "../storage/connectionProfiles";

export function createSplClientFromProfile(profile: ConnectionProfile): SecondPassClient {
  if (!profile.apiBaseUrl) throw new Error("Profile is missing apiBaseUrl. Run discovery again.");
  if (!profile.accessToken) throw new Error("Profile is not linked.");

  return createSecondPassClient({
    apiBaseUrl: profile.apiBaseUrl,
    accessToken: profile.accessToken,
    tokenType: profile.tokenType ?? "Bearer",
  });
}

