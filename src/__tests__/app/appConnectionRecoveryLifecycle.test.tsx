// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppConnectionRecoveryLifecycle } from "../../app/AppConnectionRecovery.Lifecycle";
import { saveActiveConnection } from "../../storage/ActiveConnection.Store";
import type { AppRoute } from "../../app/AppNavigation.Router";
import type { ActiveConnection } from "../../storage/ActiveConnection.Store";

vi.mock("../../storage/ActiveConnection.Store", () => ({
  saveActiveConnection: vi.fn(),
  beginActiveConnectionPublication: vi.fn(() => ({ generation: 1, expectedRecord: "connection" })),
  publishActiveConnectionResult: vi.fn((_publication: unknown, publish: () => void) => {
    publish();
    return true;
  }),
}));

const saveConnectionMock = vi.mocked(saveActiveConnection);

describe("App connection recovery lifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;
  const clearAuthorizationFailure = vi.fn();
  const onConnectionChanged = vi.fn();

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
    act(() => root.render(<Harness connection={profile("connection-a", "token-a")} route={{ kind: "home" }} />));
    expect(clearAuthorizationFailure).not.toHaveBeenCalled();

    act(() => root.render(<Harness connection={profile("connection-b", "token-b")} route={{ kind: "home" }} />));
    expect(clearAuthorizationFailure).toHaveBeenCalledOnce();
  });

  it("clears recovery state when the Library Server settings route owns repair UI", () => {
    act(() => root.render(
      <Harness connection={profile("connection-a", "token-a")} route={{ kind: "settings", tab: "library-server" }} />,
    ));
    expect(clearAuthorizationFailure).toHaveBeenCalledOnce();
  });

  it("persists repair-required state and lets workflow routing react to the connection change", () => {
    const selectedConnection = profile("connection-a", "token-a");
    act(() => root.render(
      <Harness connection={selectedConnection} route={{ kind: "home" }} authenticationRepairRequired />,
    ));

    expect(saveConnectionMock).toHaveBeenCalledWith(expect.objectContaining({
      id: "connection-a",
      authenticationState: "repair-required",
    }));
    expect(onConnectionChanged).toHaveBeenCalledOnce();
  });

  function Harness({
    connection: selectedConnection,
    route,
    authenticationRepairRequired = false,
  }: {
    connection: ActiveConnection;
    route: AppRoute;
    authenticationRepairRequired?: boolean;
  }) {
    useAppConnectionRecoveryLifecycle({
      route,
      connection: selectedConnection,
      authenticationRepairRequired,
      clearAuthorizationFailure,
      onConnectionChanged,
    });
    return null;
  }
});

function profile(id: string, accessToken: string): ActiveConnection {
  return {
    id,
    label: "Library",
    serverBaseUrl: "https://library.example",
    serverId: "123e4567-e89b-42d3-a456-426614174000",
    serverUrls: [],
    accessToken,
    createdAt: "2026-09-13T00:00:00.000Z",
  };
}
