import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiError } from "@secondpass/client";
import type { CurrentUser, SecondPassClient, ServerInfo } from "@secondpass/client";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "../app/App.Header";
import { SettingsPanel } from "../app/Settings.Panel";
import { isAuthorizationError } from "../app/AppUserFacingErrors.Mapper";
import { applyAuthenticatedContextToProfile } from "../features/connection/accountProfile";
import { loadAuthenticatedContext } from "../features/connection/authenticatedContext";
import type { ConnectionProfile } from "../storage/connectionProfiles";

describe("authenticated bootstrap context", () => {
  it("loads current user and server info concurrently", async () => {
    const getCurrentUser = vi.fn().mockResolvedValue(currentUser());
    const info = vi.fn().mockResolvedValue(serverInfo());
    const spl = { account: { getCurrentUser }, server: { info } } as unknown as SecondPassClient;

    await expect(loadAuthenticatedContext(spl)).resolves.toEqual({
      currentUser: currentUser(),
      serverInfo: serverInfo(),
    });
    expect(getCurrentUser).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledOnce();
  });

  it("uses server.info display/config and /me identity in header and Settings", () => {
    const profile = applyAuthenticatedContextToProfile(
      baseProfile(),
      currentUser(),
      serverInfo(),
      "2026-08-02T12:00:00.000Z",
    );

    const header = renderToStaticMarkup(createElement(AppHeader, {
      profile,
      view: "main",
      route: { kind: "home" },
      canNavigate: true,
      onShowHome: vi.fn(),
      onShowLibrary: vi.fn(),
      onShowSessions: vi.fn(),
      onShowShelves: vi.fn(),
      onShowSettings: vi.fn(),
    }));
    const settings = renderToStaticMarkup(createElement(SettingsPanel, {
      profile,
      onProfilesChanged: vi.fn(),
      onForgetServer: vi.fn(),
      appTheme: "light",
      onAppThemeChange: vi.fn(),
      route: { kind: "settings", tab: "library-server" },
    }));

    expect(header).toContain("Authenticated Server Name");
    expect(header).toContain("@reader-user");
    expect(settings).toContain("Authenticated Server Name");
    expect(settings).toContain("Authenticated server description");
    expect(settings).toContain("&lt;Read Er&gt;@reader-user");
    expect(profile.advancedLibraryGroupsEnabled).toBe(true);
  });

  it("preserves authorization classification when server.info rejects bootstrap", async () => {
    const authError = new ApiError({ kind: "forbidden", status: 403, message: "Token is not allowed." });
    const spl = {
      account: { getCurrentUser: vi.fn().mockResolvedValue(currentUser()) },
      server: { info: vi.fn().mockRejectedValue(authError) },
    } as unknown as SecondPassClient;

    const error = await loadAuthenticatedContext(spl).catch((reason: unknown) => reason);
    expect(isAuthorizationError(error)).toBe(true);
    expect(error).toMatchObject({ source: "serverInfo", cause: authError });
  });

  it("uses concise context copy for a non-auth server.info failure", async () => {
    const spl = {
      account: { getCurrentUser: vi.fn().mockResolvedValue(currentUser()) },
      server: { info: vi.fn().mockRejectedValue(new Error("socket closed")) },
    } as unknown as SecondPassClient;

    await expect(loadAuthenticatedContext(spl)).rejects.toMatchObject({
      source: "serverInfo",
      message: "Could not load authenticated server information.",
    });
  });
});

function baseProfile(): ConnectionProfile {
  return {
    id: "local-1",
    label: "Discovery Server Name",
    serverBaseUrl: "https://server.example",
    apiBaseUrl: "https://api.example",
    serverName: "Discovery Server Name",
    accessToken: "token",
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

function currentUser(): CurrentUser {
  return {
    username: "reader-user",
    email: "reader@example.com",
    firstName: "Read",
    lastName: "Er",
    profileId: "profile-1",
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
    name: "Authenticated Server Name",
    description: "Authenticated server description",
    bannerText: "Server banner",
    advancedLibraryGroupsEnabled: true,
    readingClientBaseUrl: "https://reader.example",
    marginaliaProfileUri: "https://example.test/profiles/marginalia",
    publicGroup: { id: "public", name: "Common Room", description: "Public catalog" },
    version: "2.4.0",
    releaseDate: "2026-08-01",
  };
}
