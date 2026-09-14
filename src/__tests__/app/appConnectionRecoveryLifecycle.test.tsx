// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppConnectionRecoveryLifecycle } from "../../app/AppConnectionRecovery.Lifecycle";
import { saveConnectionProfile } from "../../storage/ConnectionProfiles.Store";
import type { AppRoute } from "../../app/AppNavigation.Router";
import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";

vi.mock("../../storage/ConnectionProfiles.Store", () => ({ saveConnectionProfile: vi.fn() }));

const saveProfileMock = vi.mocked(saveConnectionProfile);

describe("App connection recovery lifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;
  const clearAuthorizationFailure = vi.fn();
  const onProfileChanged = vi.fn();

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("invalidates recovery state when connection identity changes", () => {
    act(() => root.render(<Harness profile={profile("connection-a", "token-a")} route={{ kind: "home" }} />));
    expect(clearAuthorizationFailure).not.toHaveBeenCalled();

    act(() => root.render(<Harness profile={profile("connection-b", "token-b")} route={{ kind: "home" }} />));
    expect(clearAuthorizationFailure).toHaveBeenCalledOnce();
  });

  it("clears recovery state when the Library Server settings route owns repair UI", () => {
    act(() => root.render(
      <Harness profile={profile("connection-a", "token-a")} route={{ kind: "settings", tab: "library-server" }} />,
    ));
    expect(clearAuthorizationFailure).toHaveBeenCalledOnce();
  });

  it("persists repair-required state and lets workflow routing react to the profile change", () => {
    const selectedProfile = profile("connection-a", "token-a");
    act(() => root.render(
      <Harness profile={selectedProfile} route={{ kind: "home" }} authenticationRepairRequired />,
    ));

    expect(saveProfileMock).toHaveBeenCalledWith(expect.objectContaining({
      id: "connection-a",
      authenticationState: "repair-required",
    }));
    expect(onProfileChanged).toHaveBeenCalledOnce();
  });

  function Harness({
    profile: selectedProfile,
    route,
    authenticationRepairRequired = false,
  }: {
    profile: ConnectionProfile;
    route: AppRoute;
    authenticationRepairRequired?: boolean;
  }) {
    useAppConnectionRecoveryLifecycle({
      route,
      profile: selectedProfile,
      authenticationRepairRequired,
      clearAuthorizationFailure,
      onProfileChanged,
    });
    return null;
  }
});

function profile(id: string, accessToken: string): ConnectionProfile {
  return {
    id,
    label: "Library",
    serverBaseUrl: "https://library.example",
    apiBaseUrl: "https://library.example/api/v1",
    accessToken,
    createdAt: "2026-09-13T00:00:00.000Z",
  };
}
