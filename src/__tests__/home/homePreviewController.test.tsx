// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MarginaliaRecentSessions, SecondPassClient, Shelf } from "@secondpass/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type HomeRecentPreview,
  type HomeShelvesPreview,
  useHomePreviewLifetime,
  useHomeRecentPreview,
  useHomeShelvesPreview,
} from "../../features/home/HomePreview.Controller";
import { recentSessionFixture } from "../sessions/SessionTest.Fixtures";

const cacheSpies = vi.hoisted(() => ({ recent: vi.fn(), shelves: vi.fn() }));

vi.mock("../../features/home/offline/OfflineHomeCache.Actions", () => ({
  cacheOfflineHomeRecent: cacheSpies.recent,
  cacheOfflineHomeShelves: cacheSpies.shelves,
}));

describe("Home preview publication ownership", () => {
  let root: Root;
  let recent: HomeRecentPreview;
  let shelves: HomeShelvesPreview;

  function Harness({ client, namespaceKey }: { client: SecondPassClient; namespaceKey: string }) {
    const lifetime = useHomePreviewLifetime(client, namespaceKey);
    recent = useHomeRecentPreview(lifetime);
    shelves = useHomeShelvesPreview(lifetime);
    return null;
  }

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    root = createRoot(document.createElement("div"));
    cacheSpies.recent.mockReset().mockResolvedValue(undefined);
    cacheSpies.shelves.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => act(() => root.unmount()));

  it.each(["success", "failure"])("rejects a stale Recent History %s after client and namespace replacement", async (outcome) => {
    const oldRecent = deferred<MarginaliaRecentSessions>();
    const currentRecent = deferred<MarginaliaRecentSessions>();
    const currentShelves = deferred<{ results: Shelf[] }>();
    await render(<Harness client={client(oldRecent.promise, resolvedShelves())} namespaceKey="old-account" />);

    await render(<Harness client={client(currentRecent.promise, currentShelves.promise)} namespaceKey="new-account" />);
    await act(async () => {
      if (outcome === "success") oldRecent.resolve(recentPage("old"));
      else oldRecent.reject(new Error("obsolete failure"));
    });

    expect(recent).toMatchObject({ data: null, busy: true, error: null });
    expect(cacheSpies.recent).not.toHaveBeenCalled();
    await act(async () => currentRecent.resolve(recentPage("current")));
    expect(recent.data?.results[0]?.book.title).toBe("current");
    expect(recent).toMatchObject({ busy: false, error: null });
  });

  it("invalidates pre-repair work even when the verified namespace is preserved", async () => {
    const oldRecent = deferred<MarginaliaRecentSessions>();
    const currentRecent = deferred<MarginaliaRecentSessions>();
    await render(<Harness client={client(oldRecent.promise, resolvedShelves())} namespaceKey="account-a" />);

    await render(<Harness client={client(currentRecent.promise, resolvedShelves())} namespaceKey="account-a" />);
    await act(async () => oldRecent.resolve(recentPage("pre-repair")));

    expect(recent).toMatchObject({ data: null, busy: true, error: null });
    expect(cacheSpies.recent).not.toHaveBeenCalled();
    await act(async () => currentRecent.resolve(recentPage("repaired")));
    expect(recent.data?.results[0]?.book.title).toBe("repaired");
    expect(cacheSpies.recent).toHaveBeenCalledTimes(1);
  });

  it("keeps a newer refresh busy when an older refresh finishes", async () => {
    const first = deferred<MarginaliaRecentSessions>();
    const second = deferred<MarginaliaRecentSessions>();
    const recentLoad = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await render(<Harness client={client(recentLoad, resolvedShelves())} namespaceKey="account-a" />);

    await act(async () => recent.retry());
    await act(async () => first.resolve(recentPage("old")));
    expect(recent).toMatchObject({ data: null, busy: true, error: null });
    expect(cacheSpies.recent).not.toHaveBeenCalled();

    await act(async () => second.resolve(recentPage("new")));
    expect(recent.data?.results[0]?.book.title).toBe("new");
    expect(recent.busy).toBe(false);
  });

  it("does not publish an old Shelf preview into a replacement identity", async () => {
    const oldShelves = deferred<{ results: Shelf[] }>();
    const currentShelves = deferred<{ results: Shelf[] }>();
    await render(<Harness client={client(resolvedRecent(), oldShelves.promise)} namespaceKey="old-account" />);
    await render(<Harness client={client(resolvedRecent(), currentShelves.promise)} namespaceKey="new-account" />);

    await act(async () => oldShelves.resolve({ results: [shelf("old")] }));
    expect(shelves).toMatchObject({ shelves: null, busy: true, error: null });
    expect(cacheSpies.shelves).not.toHaveBeenCalled();
    await act(async () => currentShelves.resolve({ results: [shelf("current")] }));
    expect(shelves.shelves).toEqual([shelf("current")]);
  });

  it("does not cache a result that completes after Home unmounts", async () => {
    const pending = deferred<MarginaliaRecentSessions>();
    await render(<Harness client={client(pending.promise, resolvedShelves())} namespaceKey="account-a" />);

    act(() => root.unmount());
    root = createRoot(document.createElement("div"));
    await act(async () => pending.resolve(recentPage("late")));

    expect(cacheSpies.recent).not.toHaveBeenCalled();
  });

  async function render(element: React.ReactNode) {
    await act(async () => root.render(element));
  }
});

function client(
  recent: Promise<MarginaliaRecentSessions> | (() => Promise<MarginaliaRecentSessions>),
  shelves: Promise<{ results: Shelf[] }>,
): SecondPassClient {
  return {
    marginalia: { sessions: { recent: typeof recent === "function" ? recent : vi.fn(() => recent) } },
    shelves: { list: vi.fn(() => shelves) },
  } as unknown as SecondPassClient;
}

function recentPage(title: string): MarginaliaRecentSessions {
  return { results: [recentSessionFixture({ book: { id: title, title, coverUrl: null, canOpen: true } })] };
}

function resolvedRecent(): Promise<MarginaliaRecentSessions> {
  return Promise.resolve(recentPage("current"));
}

function shelf(id: string): Shelf {
  return { id, name: id, owner_type: "user" };
}

function resolvedShelves(): Promise<{ results: Shelf[] }> {
  return Promise.resolve({ results: [] });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
