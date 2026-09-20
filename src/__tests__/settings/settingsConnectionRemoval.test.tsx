// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ApiError, type SecondPassClient } from "@secondpass/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "../../app/SettingsPanel.UI";
import type { ActiveConnection } from "../../storage/ActiveConnection.Store";
import { saveActiveConnection } from "../../storage/ActiveConnection.Store";

let container: HTMLDivElement;
let root: Root;

describe("Settings connection removal", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(window, "confirm").mockReturnValue(true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("binds server sign-out to SDK revocation before disconnecting", async () => {
    const order: string[] = [];
    const revokeClientSession = vi.fn(async () => { order.push("remote"); });
    renderSettings({
      client: client({ revokeClientSession }),
      onDisconnect: () => { order.push("connection"); },
    });

    await click("Sign out");

    expect(revokeClientSession).toHaveBeenCalledWith("device-1");
    expect(order).toEqual(["remote", "connection"]);
  });

  it("keeps local sign-out independent of SDK revocation", async () => {
    const revokeClientSession = vi.fn();
    const onDisconnect = vi.fn();
    renderSettings({ client: client({ revokeClientSession }), onDisconnect });

    await click("Sign out locally");

    expect(revokeClientSession).not.toHaveBeenCalled();
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it("preserves the remote authorization failure guidance", async () => {
    const revokeClientSession = vi.fn().mockRejectedValue(new ApiError({
      kind: "unauthorized",
      status: 401,
      message: "Token is invalid or revoked (401).",
    }));
    const onDisconnect = vi.fn();
    renderSettings({ client: client({ revokeClientSession }), onDisconnect });

    await click("Sign out");

    expect(container.textContent).toContain("Second Pass Library no longer recognizes this browser. Sign out locally instead.");
    expect(onDisconnect).not.toHaveBeenCalled();
  });
});

function renderSettings(input: { client: SecondPassClient; onDisconnect(): void }) {
  saveActiveConnection(profile());
  act(() => root.render(
    <SettingsPanel
      connection={profile()}
      onConnectionChanged={vi.fn()}
      onDisconnect={input.onDisconnect}
      onRepairConnection={vi.fn()}
      appTheme="light"
      onAppThemeChange={vi.fn()}
      route={{ kind: "settings", tab: "library-server" }}
      offlineNamespaceKey={null}
      client={input.client}
      connectivity="online"
    />,
  ));
}

async function click(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!button) throw new Error(`Missing button: ${label}`);
  await act(async () => button.click());
}

function client(account: Pick<SecondPassClient["account"], "revokeClientSession">): SecondPassClient {
  return { account } as SecondPassClient;
}

function profile(): ActiveConnection {
  return {
    id: "connection-1",
    label: "Library",
    serverBaseUrl: "https://library.example",
    serverId: "123e4567-e89b-42d3-a456-426614174000",
    serverUrls: [],
    accessToken: "secret",
    tokenType: "Token",
    clientSessionId: "device-1",
    verifiedAt: "2026-09-10T00:00:00Z",
    createdAt: "2026-09-10T00:00:00Z",
  };
}
