// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loadServerPresetsMock, verifySecondPassServerMock } = vi.hoisted(() => ({
  loadServerPresetsMock: vi.fn(),
  verifySecondPassServerMock: vi.fn(),
}));

vi.mock("../../features/connection/ServerPresets.Queries", () => ({
  loadServerPresets: loadServerPresetsMock,
}));

vi.mock("../../features/connection/ConnectionServer.Queries", () => ({
  verifySecondPassServer: verifySecondPassServerMock,
}));

import { ConnectServerScreen } from "../../features/connection/ConnectServerPage.UI";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  loadServerPresetsMock.mockResolvedValue([
    { url: "https://one.example.com" },
    { url: "https://two.example.com" },
  ]);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("connection server presets", () => {
  it("keeps manual URL entry available when no presets are configured", async () => {
    loadServerPresetsMock.mockResolvedValue([]);

    await act(async () => {
      root.render(
        <ConnectServerScreen onConnectionChanged={vi.fn()} />,
      );
    });

    expect(verifySecondPassServerMock).not.toHaveBeenCalled();
    expect(container.querySelectorAll('button[aria-pressed]')).toHaveLength(0);
    expect(container.querySelector<HTMLInputElement>("input")).not.toBeNull();
  });

  it("loads every preset identity while keeping each URL selectable", async () => {
    const first = deferredVerification();
    const second = deferredVerification();
    verifySecondPassServerMock.mockImplementation((url: string) => (
      url === "https://one.example.com" ? first.promise : second.promise
    ));

    await act(async () => {
      root.render(
        <ConnectServerScreen onConnectionChanged={vi.fn()} />,
      );
    });

    expect(verifySecondPassServerMock).toHaveBeenCalledTimes(2);
    expect(verifySecondPassServerMock).toHaveBeenCalledWith("https://one.example.com");
    expect(verifySecondPassServerMock).toHaveBeenCalledWith("https://two.example.com");

    const presetButtons = [...container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')];
    expect(presetButtons).toHaveLength(2);
    expect(presetButtons.every((button) => !button.disabled)).toBe(true);
    act(() => presetButtons[0]?.click());
    expect(container.querySelector<HTMLInputElement>("input")?.value).toBe("https://one.example.com");
    expect(presetButtons[0]?.getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      first.resolve(discoveryResult("https://one.example.com", "First Library", "<p>Private <em>reader</em>.</p>"));
    });
    expect(container.textContent).toContain("First Library");
    expect(container.textContent).toContain("Private reader.");
    expect(container.textContent).toContain("https://one.example.com");
    act(() => presetButtons[0]?.click());
    expect(container.querySelector<HTMLInputElement>("input")?.value).toBe("https://one.example.com");

    await act(async () => {
      second.reject(new Error("offline"));
    });
    act(() => presetButtons[1]?.click());
    const input = container.querySelector<HTMLInputElement>("input");
    expect(input?.value).toBe("https://two.example.com");
    expect(presetButtons[1]?.getAttribute("aria-pressed")).toBe("true");

    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    act(() => {
      valueSetter?.call(input, "https://manual.example.com");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(input?.value).toBe("https://manual.example.com");
    expect(presetButtons.every((button) => button.getAttribute("aria-pressed") === "false")).toBe(true);
  });
});

function deferredVerification() {
  let resolve!: (value: ReturnType<typeof discoveryResult>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<ReturnType<typeof discoveryResult>>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function discoveryResult(serverBaseUrl: string, serverName: string, serverDescription: string) {
  return {
    serverBaseUrl,
    discovery: {
      server_name: serverName,
      server_description: serverDescription,
      api_base_url: `${serverBaseUrl}/api/v1`,
      client_api: {
        discovery_version: "1",
        login_request_endpoint: "/client-api/login-requests/",
        poll_endpoint_template: "/client-api/login-requests/{id}/poll/",
        consume_endpoint_template: "/client-api/login-requests/{id}/consume/",
        token_type: "Bearer",
      },
    },
  };
}
