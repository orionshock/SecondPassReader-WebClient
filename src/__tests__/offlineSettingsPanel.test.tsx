// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OfflineSettingsView,
} from "../app/settings/offline/OfflineSettings.Panel";
import type {
  OfflineSettingsController,
  OfflineSettingsState,
} from "../app/settings/offline/OfflineSettings.Controller";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("Offline Settings surface", () => {
  it("offers retry and individual removal, and confirms before removing all copies", async () => {
    const controller = controllerStub();
    const state = readyState();
    await act(async () => root.render(
      <OfflineSettingsView state={state} controller={controller} clientAvailable />,
    ));

    await act(async () => button("Retry sync")?.click());
    await act(async () => button("Remove")?.click());
    await act(async () => button("Remove all offline copies")?.click());

    expect(controller.retrySync).toHaveBeenCalledOnce();
    expect(controller.removeAsset).toHaveBeenCalledWith(state.assets[0]);
    expect(controller.removeAllAssets).not.toHaveBeenCalled();
    expect(container.textContent).toContain("reading progress, annotations, and pending changes will remain");

    await act(async () => button("Remove offline copies")?.click());
    expect(controller.removeAllAssets).toHaveBeenCalledOnce();
  });

  it("shows empty states and disables retry without pending work", async () => {
    const state = { ...readyState(), pending: emptyPending(), assets: [], totalAssetBytes: 0 };
    await act(async () => root.render(
      <OfflineSettingsView state={state} controller={controllerStub()} clientAvailable />,
    ));

    expect(container.textContent).toContain("All offline changes are synced.");
    expect(container.textContent).toContain("No books are currently available offline.");
    expect(button("Retry sync")?.disabled).toBe(true);
    expect(button("Remove all offline copies")).toBeNull();
  });
});

function button(label: string): HTMLButtonElement | null {
  return [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label) ?? null;
}

function controllerStub(): OfflineSettingsController & {
  retrySync: ReturnType<typeof vi.fn>;
  removeAsset: ReturnType<typeof vi.fn>;
  removeAllAssets: ReturnType<typeof vi.fn>;
} {
  return {
    getSnapshot: () => readyState(),
    subscribe: () => () => undefined,
    start: () => () => undefined,
    refresh: vi.fn(async () => undefined),
    retrySync: vi.fn(async () => undefined),
    removeAsset: vi.fn(async () => undefined),
    removeAllAssets: vi.fn(async () => undefined),
  };
}

function readyState(): OfflineSettingsState {
  return {
    status: "ready",
    connectivity: "online",
    pending: { books: 1, intents: 2, sessionEstablishment: 0, progress: 1, annotations: 1 },
    assets: [{
      key: '["book-1","epub"]',
      bookId: "book-1",
      format: "epub",
      byteLength: 2 * 1024 * 1024,
      title: "Stored Book",
      titleAvailable: true,
    }],
    totalAssetBytes: 2 * 1024 * 1024,
    action: "idle",
    removingAssetKey: null,
    message: null,
  };
}

function emptyPending() {
  return { books: 0, intents: 0, sessionEstablishment: 0, progress: 0, annotations: 0 };
}
