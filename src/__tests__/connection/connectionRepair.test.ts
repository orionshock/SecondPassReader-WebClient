import { describe, expect, it, vi } from "vitest";
import type { CurrentUser, ServerInfo } from "@secondpass/client";
import { getAppWorkflowStep } from "../../app/AppWorkflow.Policy";
import { buildOfflineCacheNamespace } from "../../app/offline/namespace/OfflineCacheNamespace.Policy";
import { applyAuthenticatedContextToProfile } from "../../features/connection/ConnectionAccountProfile.Mapper";
import { markConnectionRepairRequired } from "../../features/connection/ConnectionRepair.State";
import { finalizeConnectionRepair } from "../../features/connection/ConnectionRepair.Controller";
import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";

describe("connection repair identity", () => {
  it("keeps repair and verification outside authenticated feature access", () => {
    expect(getAppWorkflowStep({ ...profile(), authenticationState: "repair-required" })).toBe("pair_device");
    expect(getAppWorkflowStep({ ...profile(), authenticationState: "verifying-repair" })).toBe("verify_connection");
  });

  it("marks credentials for repair without changing verified offline identity", () => {
    const current = profile();
    const repair = markConnectionRepairRequired(current);

    expect(namespace(repair)).toBe(namespace(current));
    expect(repair.accessToken).toBe("old-token");
    expect(repair.verifiedUser).toEqual(current.verifiedUser);
    expect(repair.authenticationState).toBe("repair-required");
  });

  it("reuses the namespace only after the same server and profile are verified", () => {
    const previous = namespace(profile());
    const repaired = applyAuthenticatedContextToProfile(
      { ...profile(), accessToken: "replacement", authenticationState: "verifying-repair" },
      user("profile-a"),
      serverInfo(),
      "2026-09-09T01:00:00.000Z",
    );

    expect(namespace(repaired)).toBe(previous);
    expect(repaired.authenticationState).toBeUndefined();
  });

  it("isolates a different verified user even when the server is unchanged", () => {
    const previous = namespace(profile());
    const repaired = applyAuthenticatedContextToProfile(
      { ...profile(), accessToken: "replacement", authenticationState: "verifying-repair" },
      user("profile-b"),
      serverInfo(),
      "2026-09-09T01:00:00.000Z",
    );

    expect(namespace(repaired)).not.toBe(previous);
  });

  it("preserves the exact namespace when repair verifies the same identity", async () => {
    const previous = { ...profile(), authenticationState: "verifying-repair" as const };
    const verified = applyAuthenticatedContextToProfile(previous, user("profile-a"), serverInfo(), "2026-09-09T01:00:00.000Z");
    const save = vi.fn();
    const removeNamespace = vi.fn();

    await expect(finalizeConnectionRepair({ previous, verified, save, removeNamespace }))
      .resolves.toEqual({ status: "saved", identity: "same" });

    expect(removeNamespace).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith(verified);
  });

  it("removes the previous namespace before activating a different verified identity", async () => {
    const previous = { ...profile(), authenticationState: "verifying-repair" as const };
    const verified = applyAuthenticatedContextToProfile(previous, user("profile-b"), serverInfo(), "2026-09-09T01:00:00.000Z");
    const order: string[] = [];

    await expect(finalizeConnectionRepair({
      previous,
      verified,
      save: () => { order.push("save"); },
      removeNamespace: async (key) => {
        expect(key).toBe(namespace(previous));
        order.push("remove");
        return { status: "removed" };
      },
    })).resolves.toEqual({ status: "saved", identity: "different" });

    expect(order).toEqual(["remove", "save"]);
  });

  it("does not activate a different identity when previous namespace cleanup fails", async () => {
    const previous = { ...profile(), authenticationState: "verifying-repair" as const };
    const verified = applyAuthenticatedContextToProfile(previous, user("profile-b"), serverInfo(), "2026-09-09T01:00:00.000Z");
    const save = vi.fn();

    await expect(finalizeConnectionRepair({
      previous,
      verified,
      save,
      removeNamespace: async () => ({ status: "failed" }),
    })).resolves.toEqual({ status: "failed" });

    expect(save).not.toHaveBeenCalled();
  });
});

function namespace(value: ConnectionProfile): string | null {
  return buildOfflineCacheNamespace({
    serverBaseUrl: value.serverBaseUrl,
    accountProfileId: value.verifiedUser?.profileId,
  })?.key ?? null;
}

function profile(): ConnectionProfile {
  return {
    id: "connection-a",
    label: "Library",
    serverBaseUrl: "https://library.example",
    apiBaseUrl: "https://library.example/api",
    accessToken: "old-token",
    verifiedAt: "2026-09-08T00:00:00.000Z",
    verifiedUser: { profileId: "profile-a", username: "reader" },
    createdAt: "2026-09-08T00:00:00.000Z",
  };
}

function user(profileId: string): CurrentUser {
  return {
    profileId,
    username: "reader",
    email: "reader@example.test",
    firstName: "Read",
    lastName: "Er",
    role: "reader",
    mustChangePassword: false,
    isOwner: false,
    isManager: false,
    isLibrarian: false,
    isReader: true,
    canAccessDjangoAdmin: false,
    groups: [],
  };
}

function serverInfo(): ServerInfo {
  return {
    name: "Library",
    description: "",
    bannerText: "",
    advancedLibraryGroupsEnabled: false,
    readingClientBaseUrl: "https://library.example",
    marginaliaProfileUri: "https://library.example/profile",
    publicGroup: { id: "public", name: "Public", description: "" },
    version: "1",
    releaseDate: "2026-09-09",
  };
}
