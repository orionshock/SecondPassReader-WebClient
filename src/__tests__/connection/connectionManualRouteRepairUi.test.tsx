// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "../../app/SettingsPanel.UI";
import type { ActiveConnection } from "../../storage/ActiveConnection.Store";

const repairRoute = vi.hoisted(() => vi.fn());
vi.mock("../../features/connection/ConnectionManualRouteRepair.Controller", () => ({ repairConnectionRoute: repairRoute }));

describe("manual route entry in Settings", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    repairRoute.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("passes the entered URL and aborts a pending attempt when cancelled", async () => {
    let finish!: (result: { status: "stale" }) => void;
    const pending = new Promise<{ status: "stale" }>((resolve) => { finish = resolve; });
    repairRoute.mockReturnValue(pending);
    act(() => root.render(settings()));

    act(() => button(container, "Use another Library URL").click());
    const input = container.querySelector<HTMLInputElement>('input[placeholder="https://library.example.com"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "https://new.example");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => button(container, "Verify and use URL").click());
    expect(repairRoute).toHaveBeenCalledOnce();
    const attempt = repairRoute.mock.calls[0]![0] as { enteredUrl: string; signal: AbortSignal };
    expect(attempt.enteredUrl).toBe("https://new.example");
    expect(attempt.signal.aborted).toBe(false);

    act(() => button(container, "Cancel").click());
    expect(attempt.signal.aborted).toBe(true);
    finish({ status: "stale" });
    await act(async () => pending);
    expect(container.querySelector('input[placeholder="https://library.example.com"]')).toBeNull();
  });

  it("keeps a different Library result next to the form and points to explicit Forget", async () => {
    repairRoute.mockResolvedValue({ status: "server-mismatch" });
    act(() => root.render(settings()));
    act(() => button(container, "Use another Library URL").click());
    await act(async () => button(container, "Verify and use URL").click());

    const form = container.querySelector("form")!;
    expect(form.querySelector('[role="alert"]')?.textContent).toContain("different Library");
    expect(form.querySelector('[role="alert"]')?.textContent).toContain("Forget connection and local data");
    expect(button(container, "Forget connection and local data").disabled).toBe(false);
  });
});

function settings() {
  return <SettingsPanel
    connection={connection()}
    onConnectionChanged={vi.fn()}
    onDisconnect={vi.fn()}
    onRepairConnection={vi.fn()}
    appTheme="light"
    onAppThemeChange={vi.fn()}
    route={{ kind: "settings", tab: "library-server" }}
    offlineNamespaceKey={null}
    client={null}
    connectivity="online"
  />;
}

function button(container: HTMLDivElement, label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

function connection(): ActiveConnection {
  return {
    id: "connection-a", label: "Library", serverBaseUrl: "https://current.example",
    serverId: "123e4567-e89b-42d3-a456-426614174000", serverUrls: [],
    accessToken: "token", verifiedAt: "2026-09-14T00:00:00.000Z",
    verifiedUser: { profileId: "profile-a", username: "reader" }, createdAt: "2026-09-14T00:00:00.000Z",
  };
}
