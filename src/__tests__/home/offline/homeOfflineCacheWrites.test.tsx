// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { SecondPassClient } from "@secondpass/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecentReadingSection } from "../../../features/library/RecentReadingPanel.UI";
import { ShelvesPreviewSection } from "../../../features/home/ShelvesPreviewPanel.UI";
import {
  useHomePreviewLifetime,
  useHomeRecentPreview,
  useHomeShelvesPreview,
} from "../../../features/home/HomePreview.Controller";
import { recentSessionFixture } from "../../sessions/SessionTest.Fixtures";

const cacheSpies = vi.hoisted(() => ({
  recent: vi.fn(),
  shelves: vi.fn(),
}));

vi.mock("../../../features/home/offline/OfflineHomeCache.Actions", () => ({
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
        <HomePreviewHarness spl={spl} namespaceKey="account-a" />,
      );
    });
    await waitFor(
      () => cacheSpies.recent.mock.calls.length === 1 && cacheSpies.shelves.mock.calls.length === 1,
      () => `shelf requests: ${vi.mocked(spl.shelves.list).mock.calls.length}; UI: ${container.textContent}`,
    );

    expect(cacheSpies.recent).toHaveBeenCalledWith(
      { namespaceKey: "account-a", items: [session] },
      expect.objectContaining({ namespaceKey: "account-a" }),
    );
    expect(cacheSpies.shelves).toHaveBeenCalledWith(
      { namespaceKey: "account-a", items: [shelf] },
      expect.objectContaining({ namespaceKey: "account-a" }),
    );
  });

  it("does not cache a failed request or let cache failure replace online data", async () => {
    const session = recentSessionFixture();
    cacheSpies.recent.mockRejectedValueOnce(new Error("storage unavailable"));
    const successfulClient = {
      marginalia: { sessions: { recent: vi.fn(async () => ({ results: [session] })) } },
    } as unknown as SecondPassClient;

    await act(async () => {
      root.render(<RecentPreviewHarness spl={successfulClient} namespaceKey="account-a" />);
    });
    await waitFor(() => container.textContent?.includes(session.book.title) === true);
    expect(container.textContent).toContain(session.book.title);

    act(() => root.unmount());
    root = createRoot(container);
    vi.clearAllMocks();
    const failedRecent = vi.fn(async () => { throw new Error("server failed"); });
    const failedClient = {
      marginalia: { sessions: { recent: failedRecent } },
    } as unknown as SecondPassClient;
    await act(async () => {
      root.render(<RecentPreviewHarness spl={failedClient} namespaceKey="account-a" />);
    });
    await waitFor(() => failedRecent.mock.calls.length === 1);

    expect(cacheSpies.recent).not.toHaveBeenCalled();
  });

  it("does not cache a failed Shelf request or let Shelf cache failure replace online data", async () => {
    const shelf = { id: "shelf-current", name: "Current Shelf", owner_type: "user" };
    cacheSpies.shelves.mockRejectedValueOnce(new Error("storage unavailable"));
    const successfulClient = {
      shelves: { list: vi.fn(async () => ({ results: [shelf] })) },
    } as unknown as SecondPassClient;

    await act(async () => {
      root.render(<ShelvesPreviewHarness spl={successfulClient} namespaceKey="account-a" />);
    });
    await waitFor(() => container.textContent?.includes("Current Shelf") === true);
    expect(container.textContent).toContain("Current Shelf");

    act(() => root.unmount());
    root = createRoot(container);
    vi.clearAllMocks();
    const failedLoad = vi.fn(async () => { throw new Error("server failed"); });
    const failedClient = { shelves: { list: failedLoad } } as unknown as SecondPassClient;
    await act(async () => {
      root.render(<ShelvesPreviewHarness spl={failedClient} namespaceKey="account-a" />);
    });
    await waitFor(() => failedLoad.mock.calls.length === 1);

    expect(cacheSpies.shelves).not.toHaveBeenCalled();
  });
});

function HomePreviewHarness({ spl, namespaceKey }: { spl: SecondPassClient; namespaceKey: string }) {
  const lifetime = useHomePreviewLifetime(spl, namespaceKey);
  const recent = useHomeRecentPreview(lifetime);
  const shelves = useHomeShelvesPreview(lifetime);
  return (
    <>
      <RecentReadingSection profile={null} preview={recent} />
      <ShelvesPreviewSection preview={shelves} />
    </>
  );
}

function RecentPreviewHarness({ spl, namespaceKey }: { spl: SecondPassClient; namespaceKey: string }) {
  const lifetime = useHomePreviewLifetime(spl, namespaceKey);
  const recent = useHomeRecentPreview(lifetime);
  return <RecentReadingSection profile={null} preview={recent} />;
}

function ShelvesPreviewHarness({ spl, namespaceKey }: { spl: SecondPassClient; namespaceKey: string }) {
  const lifetime = useHomePreviewLifetime(spl, namespaceKey);
  const shelves = useHomeShelvesPreview(lifetime);
  return <ShelvesPreviewSection preview={shelves} />;
}

async function waitFor(predicate: () => boolean, detail?: () => string): Promise<void> {
  for (let index = 0; index < 30; index += 1) {
    if (predicate()) return;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
  throw new Error(`Timed out waiting for Home cache write (${cacheSpies.recent.mock.calls.length} recent, ${cacheSpies.shelves.mock.calls.length} shelves${detail ? `; ${detail()}` : ""})`);
}
