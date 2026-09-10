import type { SecondPassClient } from "@secondpass/client";
import type { BrowserConnectivityStatus } from "../../../app/connectivity/BrowserConnectivity.State";

export function selectReaderServerClient(input: {
  source: "online" | "offline";
  connectivity: BrowserConnectivityStatus;
  client: SecondPassClient | null | undefined;
}): SecondPassClient | null {
  return input.source === "online" && input.connectivity !== "offline" ? input.client ?? null : null;
}

export function canMutateReaderServerSession(input: {
  bootstrapCanMutateSession: boolean;
  serverClientAvailable: boolean;
}): boolean {
  return input.bootstrapCanMutateSession && input.serverClientAvailable;
}
