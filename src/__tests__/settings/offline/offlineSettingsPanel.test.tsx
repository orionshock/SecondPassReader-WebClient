// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OfflineSettingsView,
} from "../../../app/settings/offline/OfflineSettingsPanel.UI";
import type {
  OfflineSettingsController,
  OfflineSettingsState,
} from "../../../app/settings/offline/OfflineSettings.Controller";

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
  vi.restoreAllMocks();
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

    await act(async () => button("Remove offline copies")?.click());
    expect(controller.removeAllAssets).toHaveBeenCalledOnce();
  });

  it("expands a route-selected pending Book into semantic actions", async () => {
    const controller = controllerStub();
    const state = readyState();
    const onOpenReader = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await act(async () => root.render(
      <OfflineSettingsView
        state={state}
        controller={controller}
        clientAvailable
        selectedBookId="book-1"
        onSelectBook={vi.fn()}
        onOpenReader={onOpenReader}
      />,
    ));

    await act(async () => button("Retry this book")?.click());
    expect(controller.retryBook).toHaveBeenCalledWith("book-1");
    await act(async () => button("Open reader")?.click());
    expect(onOpenReader).toHaveBeenCalledWith("book-1");
    await act(async () => button("Discard pending reading position")?.click());
    expect(controller.discardPendingProgress).toHaveBeenCalledWith("book-1");
  });

  it("selects an asset-only deep link and ignores a missing selection", async () => {
    const state = { ...readyState(), pending: emptyPending(), pendingBooks: [] };
    await act(async () => root.render(
      <OfflineSettingsView state={state} controller={controllerStub()} clientAvailable selectedBookId="book-1" />,
    ));
    expect(container.querySelector('[aria-current="true"]')?.textContent).toContain("Stored Book");

    await act(async () => root.render(
      <OfflineSettingsView state={state} controller={controllerStub()} clientAvailable selectedBookId="missing" />,
    ));
    expect(container.querySelector('[aria-current="true"]')).toBeNull();
    expect(container.textContent).toContain("Stored Book");
  });

  it("does not discard authored progress when confirmation is cancelled", async () => {
    const controller = controllerStub();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await act(async () => root.render(
      <OfflineSettingsView state={readyState()} controller={controller} clientAvailable selectedBookId="book-1" />,
    ));

    await act(async () => button("Discard pending reading position")?.click());
    expect(controller.discardPendingProgress).not.toHaveBeenCalled();
  });

  it("shows empty states and disables retry without pending work", async () => {
    const state = { ...readyState(), pending: emptyPending(), assets: [], totalAssetBytes: 0 };
    await act(async () => root.render(
      <OfflineSettingsView state={state} controller={controllerStub()} clientAvailable />,
    ));

    expect(button("Retry sync")?.disabled).toBe(true);
    expect(button("Remove all offline copies")).toBeNull();
  });
});

function button(label: string): HTMLButtonElement | null {
  return [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label) ?? null;
}

function controllerStub(): OfflineSettingsController & {
  retrySync: ReturnType<typeof vi.fn>;
  retryBook: ReturnType<typeof vi.fn>;
  discardPendingProgress: ReturnType<typeof vi.fn>;
  removeAsset: ReturnType<typeof vi.fn>;
  removeAllAssets: ReturnType<typeof vi.fn>;
} {
  return {
    getSnapshot: () => readyState(),
    subscribe: () => () => undefined,
    start: () => () => undefined,
    refresh: vi.fn(async () => undefined),
    retrySync: vi.fn(async () => undefined),
    retryBook: vi.fn(async () => undefined),
    discardPendingProgress: vi.fn(async () => undefined),
    removeAsset: vi.fn(async () => undefined),
    removeAllAssets: vi.fn(async () => undefined),
  };
}

function readyState(): OfflineSettingsState {
  return {
    status: "ready",
    connectivity: "online",
    pending: { books: 1, intents: 2, sessionEstablishment: 0, progress: 1, annotations: 1, attentionBooks: 0, deferredBooks: 0 },
    pendingBooks: [{
      bookId: "book-1",
      title: "Stored Book",
      titleAvailable: true,
      pendingIntentCount: 2,
      needsSessionEstablishment: false,
      hasProgress: true,
      annotationUpsertCount: 1,
      annotationDeleteCount: 0,
      hasOfflineAsset: true,
      assetFormats: ["EPUB"],
      assetBytes: 2 * 1024 * 1024,
      status: "waiting",
      attentionIntentCount: 0,
      deferredIntentCount: 0,
      sessionStatus: null,
      progressStatus: "waiting",
      annotationStatus: "waiting",
    }],
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
    activeBookId: null,
    removingAssetKey: null,
    message: null,
  };
}

function emptyPending() {
  return { books: 0, intents: 0, sessionEstablishment: 0, progress: 0, annotations: 0, attentionBooks: 0, deferredBooks: 0 };
}
