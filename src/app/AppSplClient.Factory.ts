import { createSecondPassClient, type SecondPassClient } from "@secondpass/client";
import type { ConnectionProfile } from "../storage/ConnectionProfiles.Store";

export function createSplClientFromProfile(profile: ConnectionProfile): SecondPassClient {
  if (!profile.apiBaseUrl) throw new Error("Library connection is missing apiBaseUrl. Connect again.");
  if (!profile.accessToken) throw new Error("Library is not linked.");

  return createSecondPassClient({
    apiBaseUrl: profile.apiBaseUrl,
    accessToken: profile.accessToken,
    tokenType: profile.tokenType ?? "Bearer",
  });
}
