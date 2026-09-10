// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "../app/App.Header";

describe("App header navigation", () => {
  it("exposes an accessible Home control that activates Home navigation", () => {
    const onShowHome = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => root.render(createElement(AppHeader, {
      profile: null,
      view: "main",
      route: { kind: "library" },
      canNavigate: true,
      connectivity: "online",
      onShowHome,
      onShowLibrary: vi.fn(),
      onShowSessions: vi.fn(),
      onShowShelves: vi.fn(),
      onShowSettings: vi.fn(),
    })));

    const home = container.querySelector<HTMLButtonElement>('button[aria-label="Home"]');
    expect(home).not.toBeNull();
    act(() => home?.click());
    expect(onShowHome).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });

  it("announces explicit offline connectivity without disabling local navigation", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => root.render(createElement(AppHeader, {
      profile: null,
      view: "main",
      route: { kind: "home" },
      canNavigate: true,
      connectivity: "offline",
      onShowHome: vi.fn(),
      onShowLibrary: vi.fn(),
      onShowSessions: vi.fn(),
      onShowShelves: vi.fn(),
      onShowSettings: vi.fn(),
    })));

    expect(container.querySelector('[role="status"]')?.textContent).toBe("Offline");
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Home"]')?.disabled).toBe(false);
    expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Library")?.disabled).toBe(false);

    act(() => root.unmount());
  });
});
