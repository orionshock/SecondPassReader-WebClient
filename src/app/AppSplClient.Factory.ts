import { createSecondPassClient, deriveApiRootUrl, type SecondPassClient } from "@secondpass/client";
import type { ActiveConnection } from "../storage/ActiveConnection.Store";

export function createSplClientFromConnection(connection: ActiveConnection): SecondPassClient {
  if (!connection.serverId) throw new Error("Library connection is missing server ID. Connect again.");
  if (!connection.accessToken) throw new Error("Library is not linked.");

  return createSecondPassClient({
    apiRootUrl: deriveApiRootUrl(connection.serverBaseUrl),
    accessToken: connection.accessToken,
    tokenType: connection.tokenType ?? "Bearer",
  });
}
