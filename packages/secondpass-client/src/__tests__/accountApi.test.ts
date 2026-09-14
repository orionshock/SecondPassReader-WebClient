import { beforeEach, describe, expect, it } from "vitest";

import { ApiError, createSecondPassClient } from "../index";
import { emptyResponse, installMockFetch as asMockFetch, jsonResponse } from "./SdkTestTransport.Fixtures";

describe("SDK Account API", () => {
  beforeEach(() => {
    asMockFetch();
  });

  it("account.getCurrentUser projects identity, role flags, and groups", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        username: "ada",
        email: "ada@example.test",
        first_name: "Ada",
        last_name: "Lovelace",
        profile_id: "profile-1",
        role: "reader",
        is_owner: true,
        can_access_django_admin: true,
        groups: [
          { id: "public", name: "Common Room", is_public_group: true },
          { id: "club", name: "Fantasy Club", is_public_group: false, is_curator: true },
        ],
      }),
    );

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    const me = await spl.account.getCurrentUser();

    expect(me.username).toBe("ada");
    expect(me.email).toBe("ada@example.test");
    expect(me.firstName).toBe("Ada");
    expect(me.lastName).toBe("Lovelace");
    expect(me.profileId).toBe("profile-1");
    expect(me.role).toBe("reader");
    expect(me.mustChangePassword).toBe(false);
    expect(me.isOwner).toBe(true);
    expect(me.isManager).toBe(false);
    expect(me.isLibrarian).toBe(false);
    expect(me.isReader).toBe(false);
    expect(me.canAccessDjangoAdmin).toBe(true);
    expect(me.groups).toEqual([
      { id: "public", name: "Common Room", isPublicGroup: true, isCurator: false },
      { id: "club", name: "Fantasy Club", isPublicGroup: false, isCurator: true },
    ]);
    expect(me).not.toHaveProperty("advancedLibraryGroupsEnabled");
    expect(me).not.toHaveProperty("bannerText");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.example/accounts/me/");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer t");
  });

  it("account.getCurrentUser derives manager, librarian, and reader flags from role", async () => {
    const fetchMock = asMockFetch();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ username: "manager", role: "manager" }))
      .mockResolvedValueOnce(jsonResponse({ username: "librarian", role: "librarian" }))
      .mockResolvedValueOnce(jsonResponse({ username: "reader", role: "reader" }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await expect(spl.account.getCurrentUser()).resolves.toMatchObject({
      isOwner: false,
      isManager: true,
      isLibrarian: false,
      isReader: false,
      mustChangePassword: false,
      canAccessDjangoAdmin: false,
      groups: [],
    });
    await expect(spl.account.getCurrentUser()).resolves.toMatchObject({
      isOwner: false,
      isManager: false,
      isLibrarian: true,
      isReader: false,
    });
    await expect(spl.account.getCurrentUser()).resolves.toMatchObject({
      isOwner: false,
      isManager: false,
      isLibrarian: false,
      isReader: true,
    });
  });

  it("account.revokeClientSession sends an authenticated DELETE to the encoded session endpoint", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(emptyResponse());

    const spl = createSecondPassClient({
      apiBaseUrl: "https://api.example/api/v1",
      accessToken: "secret",
      tokenType: "Token",
    });
    await expect(spl.account.revokeClientSession("browser/session 1")).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.example/api/v1/accounts/me/client-sessions/browser%2Fsession%201/");
    expect(init?.method).toBe("DELETE");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Token secret");
    expect(init?.body).toBeUndefined();
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [500, "http_error"],
  ] as const)("account.revokeClientSession maps HTTP %i through ApiError", async (status, kind) => {
    asMockFetch().mockResolvedValueOnce(new Response("revoke failed", { status }));
    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example/api/v1", accessToken: "secret" });

    const error = await spl.account.revokeClientSession("session-1").catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind, status, message: `Logout failed with HTTP ${status}.` });
  });

});
