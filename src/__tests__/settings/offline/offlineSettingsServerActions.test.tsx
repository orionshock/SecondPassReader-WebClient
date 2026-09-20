// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsLibraryServerPanel } from "../../../app/settings/SettingsLibraryServerPanel.UI";
import type { ActiveConnection } from "../../../storage/ActiveConnection.Store";

let container: HTMLDivElement;
let root: Root;

describe("offline Second Pass Library settings", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("disables server calls while leaving local retention actions available", () => {
    act(() => root.render(
      <SettingsLibraryServerPanel
        connection={profile()}
        state={{ phase: "idle" }}
        busy={false}
        serverActionsAvailable={false}
        onConnect={vi.fn()}
        onCheckConnection={vi.fn()}
        onLogOut={vi.fn()}
        onSignOutLocally={vi.fn()}
        onRepairConnection={vi.fn()}
        onForgetLocally={vi.fn()}
      />,
    ));

    expect(button("Check connection").disabled).toBe(true);
    expect(button("Repair connection").disabled).toBe(true);
    expect(button("Sign out").disabled).toBe(true);
    expect(button("Sign out locally").disabled).toBe(false);
    expect(button("Forget connection and local data").disabled).toBe(false);
  });
});

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

function profile(): ActiveConnection {
  return {
    id: "connection-1",
    label: "Library",
    serverBaseUrl: "https://library.example",
    serverId: "123e4567-e89b-42d3-a456-426614174000",
    serverUrls: [],
    accessToken: "token",
    clientSessionId: "device-1",
    verifiedAt: "2026-09-10T00:00:00Z",
    createdAt: "2026-09-10T00:00:00Z",
  };
}
