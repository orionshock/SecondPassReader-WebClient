// @vitest-environment jsdom
import { act, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenedBook, OfflineReaderBootstrap } from "../../../features/reader/Reader.Types";

let shellMounts = 0;
let shellUnmounts = 0;

vi.mock("../../../features/reader/shell/ReadingShell.Orchestrator", () => ({
  ReadingShell: () => {
    const instance = useRef(Symbol("reader-shell"));
    useEffect(() => {
      shellMounts += 1;
      return () => { shellUnmounts += 1; };
    }, []);
    return <div data-shell-instance={String(instance.current)} />;
  },
}));

vi.mock("../../../features/reader/session/OnlineReaderOfflineHandoff.Controller", () => ({
  useOnlineReaderOfflineHandoff: (input: { connectivity: string }) => input.connectivity === "offline"
    ? { status: "ready", bootstrap: localBootstrap() }
    : { status: "inactive", bootstrap: null },
}));

vi.mock("../../../features/reader/session/progress/OfflineReadingProgress.Lifecycle", () => ({
  useOfflineReadingProgress: () => ({ status: "idle", dirty: false }),
}));

vi.mock("../../../features/reader/session/annotations/OfflineCurrentSessionAnnotation.Lifecycle", () => ({
  useOfflineCurrentSessionAnnotations: () => ({
    canMutate: true,
    annotationBusy: false,
    toggleBookmarkAtCurrentLocation: vi.fn(),
    createHighlight: vi.fn(),
    updateHighlight: vi.fn(),
    removeById: vi.fn(),
  }),
}));

import { ReadingSessionOrchestrator } from "../../../features/reader/session/ReadingSession.Orchestrator";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

describe("Reading Session offline handoff", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    shellMounts = 0;
    shellUnmounts = 0;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps the mounted Reader shell instance across online to offline ownership handoff", async () => {
    await render("online");
    expect(shellMounts).toBe(1);
    expect(shellUnmounts).toBe(0);

    await render("offline");
    expect(shellMounts).toBe(1);
    expect(shellUnmounts).toBe(0);

    async function render(connectivity: "online" | "offline") {
      await act(async () => root.render(
        <ReadingSessionOrchestrator
          openedBook={openedBook()}
          connectivity={connectivity}
          offlineNamespaceKey="account-a"
        >
          {(state) => state.shell}
        </ReadingSessionOrchestrator>,
      ));
    }
  });
});

const BOOK_BLOB = new Blob(["book"]);
const OPENED_BOOK: OpenedBook = {
  source: "online",
  book: {
    id: "book-1",
    title: "Book",
    sortTitle: "Book",
    subtitle: "",
    authors: [],
    series: null,
    catalogTags: [],
    language: null,
    publisher: null,
    publishedYear: null,
    publishedMonth: null,
    publishedDay: null,
    publishedDatePrecision: "",
    coverUrl: null,
    fileFormat: "epub",
  },
  blob: BOOK_BLOB,
  objectUrl: "blob:book-1",
  openedAt: "2026-09-12T00:00:00Z",
  returnTarget: { kind: "library", label: "Library", route: "#/library" },
  bootstrap: {
    kind: "server",
    marginalia: {
      created: false,
      context: { book: { id: "book-1", title: "Book", coverUrl: null, canOpen: true } },
      session: null,
      annotations: [],
      closedSessions: { count: 0, next: null, previous: null, results: [] },
    },
  },
};

function openedBook(): OpenedBook {
  return OPENED_BOOK;
}

function localBootstrap(): OfflineReaderBootstrap {
  return {
    kind: "local",
    serverWritesAllowed: false,
    continuity: {
      annotationRevision: 0,
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
