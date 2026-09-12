// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarginaliaBootstrap } from "@secondpass/client";
import type { BrowserConnectivityStatus } from "../../../app/connectivity/BrowserConnectivity.State";
import {
  useOnlineReaderOfflineHandoff,
  type OnlineReaderOfflineHandoffState,
} from "../../../features/reader/session/OnlineReaderOfflineHandoff.Controller";
import { createInMemoryOfflineRepositoryFactories } from "../../offline/storage/OfflineRepositoryTest.Fixtures";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

describe("online Reader offline handoff lifecycle", () => {
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

  it("activates only for explicit offline connectivity and remains local-first after reconnect", async () => {
    const factories = createInMemoryOfflineRepositoryFactories();
    const readerState = await factories.createReaderStateRepository();
    const readerOutbox = await factories.createReaderOutboxRepository();
    const close = vi.fn();
    const openRepositories = vi.fn(async () => ({ readerState, readerOutbox, close }));
    let observed: OnlineReaderOfflineHandoffState = { status: "inactive", bootstrap: null };

    await render("unknown");
    await render("online");
    expect(openRepositories).not.toHaveBeenCalled();

    await render("offline");
    await waitFor(() => observed.status === "ready");
    const readyBootstrap = (observed as unknown as Extract<OnlineReaderOfflineHandoffState, { status: "ready" }>).bootstrap;
    expect(readyBootstrap?.continuity.session).toMatchObject({
      kind: "server-confirmed",
      serverSessionId: "session-1",
    });

    await render("online");
    expect(observed).toMatchObject({ status: "ready", bootstrap: readyBootstrap });
    expect(openRepositories).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();

    async function render(connectivity: BrowserConnectivityStatus) {
      await act(async () => root.render(
        <Harness
          connectivity={connectivity}
          openRepositories={openRepositories}
          onState={(state) => { observed = state; }}
        />,
      ));
    }
  });

  it("keeps authoring unavailable when local persistence cannot be opened", async () => {
    let observed: OnlineReaderOfflineHandoffState = { status: "inactive", bootstrap: null };
    const openRepositories = vi.fn(async () => { throw new Error("storage unavailable"); });

    await act(async () => root.render(
      <Harness
        connectivity="offline"
        openRepositories={openRepositories}
        onState={(state) => { observed = state; }}
      />,
    ));
    await waitFor(() => observed.status === "error");

    expect(observed).toEqual({ status: "error", bootstrap: null });
  });

  it("does not expose retained state without a verified namespace", async () => {
    const openRepositories = vi.fn();
    let observed: OnlineReaderOfflineHandoffState = { status: "loading", bootstrap: null };

    await act(async () => root.render(
      <Harness
        connectivity="offline"
        namespaceKey={null}
        openRepositories={openRepositories}
        onState={(state) => { observed = state; }}
      />,
    ));

    expect(observed).toEqual({ status: "inactive", bootstrap: null });
    expect(openRepositories).not.toHaveBeenCalled();
  });
});

function Harness({
  connectivity,
  namespaceKey = "account-a",
  openRepositories,
  onState,
}: {
  connectivity: BrowserConnectivityStatus;
  namespaceKey?: string | null;
  openRepositories: NonNullable<Parameters<typeof useOnlineReaderOfflineHandoff>[0]["openRepositories"]>;
  onState: (state: OnlineReaderOfflineHandoffState) => void;
}) {
  const state = useOnlineReaderOfflineHandoff({
    source: "online",
    connectivity,
    namespaceKey,
    bookId: "book-1",
    serverBootstrap: BOOTSTRAP,
    readAnnotations: readNoAnnotations,
    progress: { cfi: "epubcfi(/6/8)", percentage: 40, locationLabel: "040% - Chapter" },
    openRepositories,
  });
  onState(state);
  return null;
}

const BOOTSTRAP: MarginaliaBootstrap = {
    created: false,
    context: {
      book: { id: "book-1", title: "Book", coverUrl: null, canOpen: true },
    },
    session: {
      id: "session-1",
      name: "Reading Session",
      notes: "",
      status: "active",
      startedAt: "2026-09-12T00:00:00Z",
      closedAt: null,
      updatedAt: "2026-09-12T00:00:00Z",
      lastActivityAt: "2026-09-12T00:00:00Z",
      annotationCount: 0,
      progress: null,
    },
    annotations: [],
    closedSessions: { count: 0, next: null, previous: null, results: [] },
};

const readNoAnnotations = () => [];

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await act(async () => Promise.resolve());
  }
  throw new Error("Condition was not reached.");
}
