// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { SecondPassClient } from "@secondpass/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecentReadingSection } from "../features/library/RecentReadingPanel.UI";
import { ShelvesPreviewSection } from "../features/home/ShelvesPreviewPanel.UI";
import { recentSessionFixture } from "./SessionTest.Fixtures";

const cacheSpies = vi.hoisted(() => ({
  recent: vi.fn(),
  shelves: vi.fn(),
}));

vi.mock("../features/home/offline/OfflineHomeCache.Actions", () => ({
  cacheOfflineHomeRecent: cacheSpies.recent,
  cacheOfflineHomeShelves: cacheSpies.shelves,
}));

let container: HTMLDivElement;
let root: Root;

describe("online Home cache side effects", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    cacheSpies.recent.mockResolvedValue(undefined);
    cacheSpies.shelves.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("caches only successfully loaded Recent and Shelf preview values", async () => {
    const session = recentSessionFixture();
    const shelf = { id: "shelf-1", name: "Shelf", owner_type: "user" };
    const spl = {
      marginalia: { sessions: { recent: vi.fn(async () => ({ results: [session] })) } },
      shelves: { list: vi.fn(async () => ({ results: [shelf] })) },
    } as unknown as SecondPassClient;

    await act(async () => {
      root.render(
        <>
          <RecentReadingSection profile={null} spl={spl} offlineNamespaceKey="account-a" />
          <ShelvesPreviewSection spl={spl} offlineNamespaceKey="account-a" />
        </>,
      );
    });
    await waitFor(() => cacheSpies.recent.mock.calls.length === 1 && cacheSpies.shelves.mock.calls.length === 1);

    expect(cacheSpies.recent).toHaveBeenCalledWith({ namespaceKey: "account-a", items: [session] });
    expect(cacheSpies.shelves).toHaveBeenCalledWith({ namespaceKey: "account-a", items: [shelf] });
  });

  it("does not cache a failed request or let cache failure replace online data", async () => {
    const session = recentSessionFixture();
    cacheSpies.recent.mockRejectedValueOnce(new Error("storage unavailable"));
    const successfulClient = {
      marginalia: { sessions: { recent: vi.fn(async () => ({ results: [session] })) } },
    } as unknown as SecondPassClient;

    await act(async () => {
      root.render(<RecentReadingSection profile={null} spl={successfulClient} offlineNamespaceKey="account-a" />);
    });
    await waitFor(() => container.textContent?.includes(session.book.title) === true);
    expect(container.textContent).toContain(session.book.title);

    act(() => root.unmount());
    root = createRoot(container);
    vi.clearAllMocks();
    const failedClient = {
      marginalia: { sessions: { recent: vi.fn(async () => { throw new Error("server failed"); }) } },
    } as unknown as SecondPassClient;
    await act(async () => {
      root.render(<RecentReadingSection profile={null} spl={failedClient} offlineNamespaceKey="account-a" />);
    });
    await waitFor(() => container.textContent?.includes("Could not load recent reading") === true);

    expect(cacheSpies.recent).not.toHaveBeenCalled();
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 30; index += 1) {
    if (predicate()) return;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
  throw new Error("Timed out waiting for Home cache write");
}
