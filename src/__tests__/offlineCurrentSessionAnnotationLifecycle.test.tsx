// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarginaliaAnnotation } from "@secondpass/client";
import type { OfflineReaderBootstrap } from "../features/reader/Reader.Types";
import type { ReaderBookmark } from "../features/reader/annotations/ReaderBookmark.Mapper";
import { useOfflineCurrentSessionAnnotations } from "../features/reader/session/annotations/OfflineCurrentSessionAnnotation.Lifecycle";
import { createInMemoryOfflineRepositoryFactories } from "./OfflineRepositoryTest.Fixtures";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

describe("offline current-session annotation lifecycle", () => {
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
      <Harness bootstrap={null} openRepositories={openRepositories} onActions={() => undefined} />,
    ));
    expect(openRepositories).not.toHaveBeenCalled();
  });

  it("enables local actions after repository readiness and persists without an SDK owner", async () => {
    const factories = createInMemoryOfflineRepositoryFactories();
    const readerState = await factories.createReaderStateRepository();
    const readerOutbox = await factories.createReaderOutboxRepository();
    const close = vi.fn();
    let actions!: ReturnType<typeof useOfflineCurrentSessionAnnotations>;

    await act(async () => root.render(
      <Harness
        bootstrap={bootstrap()}
        openRepositories={async () => ({ readerState, readerOutbox, close })}
        onActions={(value) => { actions = value; }}
      />,
    ));
    await act(async () => Promise.resolve());
    expect(actions.canMutate).toBe(true);

    await act(async () => {
      await actions.createHighlight({
        selection: { cfiRange: "epubcfi(/6/4)", text: "Offline text" },
        color: "yellow",
      });
    });

    expect((await readerState.getBookState("account-a", "book-1"))?.annotations).toHaveLength(1);
    expect(await readerOutbox.list("account-a")).toEqual([
      expect.objectContaining({ type: "upsert-annotation", serverSessionId: null }),
    ]);
  });
});

function Harness({
  bootstrap: value,
  openRepositories,
  onActions,
}: {
  bootstrap: OfflineReaderBootstrap | null;
  openRepositories: NonNullable<Parameters<typeof useOfflineCurrentSessionAnnotations>[0]["openRepositories"]>;
  onActions: (actions: ReturnType<typeof useOfflineCurrentSessionAnnotations>) => void;
}) {
  const [annotations, setAnnotations] = useState<MarginaliaAnnotation[]>([]);
  const actions = useOfflineCurrentSessionAnnotations({
    bootstrap: value,
    location: { cfi: "epubcfi(/6/4)", bookProgress: 0.1 },
    locationLabel: "010% - Chapter",
    currentBookmark: null as ReaderBookmark | null,
    setAnnotationsRaw: setAnnotations,
    setAnnotationError: () => undefined,
    openRepositories,
  });
  onActions(actions);
  return <span>{annotations.length}</span>;
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
