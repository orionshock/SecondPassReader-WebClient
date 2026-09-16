import type { ActiveConnection } from "../../storage/ActiveConnection.Store";

export function markConnectionRepairRequired(connection: ActiveConnection): ActiveConnection {
  return { ...connection, authenticationState: "repair-required" };
}
