// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OfflineReaderBootstrap } from "../features/reader/Reader.Types";
import { useOfflineReadingProgress } from "../features/reader/session/progress/OfflineReadingProgress.Lifecycle";
import { createInMemoryOfflineRepositoryFactories } from "./OfflineRepositoryTest.Fixtures";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

describe("offline reading progress lifecycle", () => {
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

  it("does not open offline repositories for an online Reader bootstrap", async () => {
    const openRepositories = vi.fn();

    await act(async () => root.render(
      <Harness bootstrap={null} openRepositories={openRepositories} />,
    ));

    expect(openRepositories).not.toHaveBeenCalled();
  });

  it("flushes the latest local candidate when the Reader unmounts", async () => {
    const factories = createInMemoryOfflineRepositoryFactories();
    const readerState = await factories.createReaderStateRepository();
    const readerOutbox = await factories.createReaderOutboxRepository();
    const close = vi.fn();
    const openRepositories = vi.fn(async () => ({ readerState, readerOutbox, close }));

    await act(async () => root.render(
      <Harness bootstrap={bootstrap()} openRepositories={openRepositories} />,
    ));
    await act(async () => Promise.resolve());
    act(() => root.unmount());
    root = createRoot(container);
    await waitFor(async () => (
      (await readerState.getBookState("account-a", "book-1"))?.progress?.cfi === "epubcfi(/6/8)"
    ));

    expect(await readerOutbox.list("account-a")).toEqual([
      expect.objectContaining({ type: "replace-progress", serverSessionId: null }),
    ]);
    expect(close).toHaveBeenCalledOnce();
  });
});

function Harness({
  bootstrap: value,
  openRepositories,
}: {
  bootstrap: OfflineReaderBootstrap | null;
  openRepositories: NonNullable<Parameters<typeof useOfflineReadingProgress>[0]["openRepositories"]>;
}) {
  useOfflineReadingProgress({
    bootstrap: value,
    location: {
      cfi: "epubcfi(/6/8)",
      href: "chapter.xhtml",
      bookProgress: 0.3,
    },
    toc: [{ id: "chapter", label: "Chapter", href: "chapter.xhtml" }],
    bookTitle: "Book",
    openRepositories,
  });
  return null;
}

function bootstrap(): OfflineReaderBootstrap {
  return {
    kind: "local",
    serverWritesAllowed: false,
    continuity: {
      namespaceKey: "account-a",
      bookId: "book-1",
      schemaVersion: 1,
      session: {
        kind: "provisional",
        localSessionId: "local:test",
        serverSessionId: null,
        lastKnownServerStatus: null,
      },
      progress: null,
      annotations: [],
    },
  };
}

async function waitFor(predicate: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Condition was not reached.");
}
