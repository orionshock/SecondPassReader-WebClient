import { createSecondPassClient, type SecondPassClient } from "@secondpass/client";
import type { ActiveConnection } from "../storage/ActiveConnection.Store";

export function createSplClientFromConnection(connection: ActiveConnection): SecondPassClient {
  if (!connection.apiBaseUrl) throw new Error("Library connection is missing apiBaseUrl. Connect again.");
  if (!connection.accessToken) throw new Error("Library is not linked.");

  return createSecondPassClient({
    apiBaseUrl: connection.apiBaseUrl,
    accessToken: connection.accessToken,
    tokenType: connection.tokenType ?? "Bearer",
  });
}
