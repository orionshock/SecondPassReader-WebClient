import type { SecondPassClient } from "@secondpass/client";
import { describe, expect, it } from "vitest";
import {
  canMutateReaderServerSession,
  selectReaderServerClient,
} from "../../../features/reader/session/ReaderConnectivity.Policy";

describe("Reader connectivity policy", () => {
  const client = {} as SecondPassClient;

  it("withholds server mutation authority while explicitly offline", () => {
    expect(selectReaderServerClient({ source: "online", connectivity: "offline", client })).toBeNull();
    expect(canMutateReaderServerSession({
      bootstrapCanMutateSession: true,
      serverClientAvailable: false,
    })).toBe(false);
  });

  it.each(["online", "unknown"] as const)("preserves online Reader authority while connectivity is %s", (connectivity) => {
    expect(selectReaderServerClient({ source: "online", connectivity, client })).toBe(client);
  });

  it("never gives a local bootstrap a server client", () => {
    expect(selectReaderServerClient({ source: "offline", connectivity: "online", client })).toBeNull();
  });
});
