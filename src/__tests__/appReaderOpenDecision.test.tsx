// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { BookDetail, SecondPassClient } from "@secondpass/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppReaderOpenController } from "../app/AppReaderOpen.Controller";
import { getBrowserConnectivitySnapshot } from "../app/connectivity/BrowserConnectivity.State";
import {
  loadOfflineReaderBookMetadata,
  openOfflineBookForReader,
} from "../app/offline/OfflineReaderOpen.Actions";
import { openIndexedDbOfflineRepositories } from "../app/offline/IndexedDbOfflineRepositories.Factory";
import { openBookForReader } from "../features/library/LibraryBookOpen.Actions";
import type { OfflineOpenedBook, OpenedBook } from "../features/reader/Reader.Types";
import type { ConnectionProfile } from "../storage/ConnectionProfiles.Store";

vi.mock("../app/connectivity/BrowserConnectivity.State", () => ({
  getBrowserConnectivitySnapshot: vi.fn(),
  subscribeToBrowserConnectivity: vi.fn(() => () => undefined),
}));
vi.mock("../features/library/LibraryBookOpen.Actions", () => ({ openBookForReader: vi.fn() }));
vi.mock("../app/offline/IndexedDbOfflineRepositories.Factory", () => ({ openIndexedDbOfflineRepositories: vi.fn() }));
vi.mock("../app/offline/OfflineReaderOpen.Actions", () => ({
  loadOfflineReaderBookMetadata: vi.fn(),
  openOfflineBookForReader: vi.fn(),
}));

const connectivityMock = vi.mocked(getBrowserConnectivitySnapshot);
const onlineOpenMock = vi.mocked(openBookForReader);
const repositoriesMock = vi.mocked(openIndexedDbOfflineRepositories);
const loadMetadataMock = vi.mocked(loadOfflineReaderBookMetadata);
const offlineOpenMock = vi.mocked(openOfflineBookForReader);

let container: HTMLDivElement;
let root: Root;

describe("app Reader open decision", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it.each(["online", "unknown"] as const)(
    "keeps the existing server-backed path for %s connectivity",
    async (connectivity) => {
      connectivityMock.mockReturnValue(connectivity);
      const value = book();
      const spl = splClient(value);
      onlineOpenMock.mockResolvedValue(onlineOpenedBook(value));
      const observed: { current: ReturnType<typeof useAppReaderOpenController> | null } = { current: null };

      await renderController(spl, (next) => { observed.current = next; });
      await waitFor(() => observed.current?.openedBook?.source === "online");

      expect(spl.library.books.get).toHaveBeenCalledWith("book-1");
      expect(onlineOpenMock).toHaveBeenCalledWith({ spl, book: value });
      expect(repositoriesMock).not.toHaveBeenCalled();
      expect(offlineOpenMock).not.toHaveBeenCalled();
    },
  );

  it("opens explicit offline connectivity from local repositories without server open or download", async () => {
    connectivityMock.mockReturnValue("offline");
    const value = book();
    const spl = splClient(value);
    const repositories = repositorySet();
    repositoriesMock.mockResolvedValue(repositories as never);
    loadMetadataMock.mockResolvedValue(value);
    offlineOpenMock.mockResolvedValue({ status: "opened", openedBook: offlineOpenedBook(value) });
    const observed: { current: ReturnType<typeof useAppReaderOpenController> | null } = { current: null };

    await renderController(spl, (next) => { observed.current = next; });
    await waitFor(() => observed.current?.openedBook?.source === "offline");

    expect(spl.library.books.get).not.toHaveBeenCalled();
    expect(onlineOpenMock).not.toHaveBeenCalled();
    expect(loadMetadataMock).toHaveBeenCalledWith(expect.objectContaining({
      namespaceKey: "server:https%3A%2F%2Flibrary.example|profile:reader-1",
      bookId: "book-1",
    }));
    expect(offlineOpenMock).toHaveBeenCalledWith(expect.objectContaining({
      book: value,
      assetRepository: repositories.publicationAssets,
      readerStateRepository: repositories.readerState,
      outboxRepository: repositories.readerOutbox,
    }));
    expect(repositories.close).toHaveBeenCalledOnce();
  });

  it("normalizes offline repository failure and leaves the Reader route retryable", async () => {
    connectivityMock.mockReturnValue("offline");
    repositoriesMock.mockRejectedValue(new Error("https://private.example/?token=secret"));
    const observed: { current: ReturnType<typeof useAppReaderOpenController> | null } = { current: null };

    await renderController(splClient(book()), (next) => { observed.current = next; });
    await waitFor(() => Boolean(observed.current?.readerRestoreError));

    expect(observed.current?.readerRestoreError).toBe("This book is not available offline.");
    expect(window.location.hash).toBe("#/reader/book-1");
  });
});

async function renderController(
  spl: SecondPassClient,
  observe: (controller: ReturnType<typeof useAppReaderOpenController>) => void,
) {
  window.location.hash = "#/reader/book-1";
  await act(async () => root.render(<Harness spl={spl} observe={observe} />));
}

function Harness({
  spl,
  observe,
}: {
  spl: SecondPassClient;
  observe: (controller: ReturnType<typeof useAppReaderOpenController>) => void;
}) {
  const controller = useAppReaderOpenController({
    route: TEST_ROUTE,
    workflowStep: "library_home",
    profile: TEST_PROFILE,
    spl,
    reportAuthorizationFailure,
  });
  useEffect(() => observe(controller), [controller, observe]);
  return null;
}

const reportAuthorizationFailure = vi.fn();
const TEST_ROUTE = { kind: "reader", bookId: "book-1" } as const;

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  throw new Error("Condition was not reached.");
}

function splClient(value: BookDetail): SecondPassClient {
  return {
    library: {
      books: {
        get: vi.fn(async () => value),
      },
    },
  } as unknown as SecondPassClient;
}

function repositorySet() {
  return {
    projections: {},
    publicationAssets: {},
    readerState: {},
    readerOutbox: {},
    close: vi.fn(),
  };
}

const TEST_PROFILE: ConnectionProfile = {
  id: "connection-1",
  label: "Library",
  serverBaseUrl: "https://library.example",
  apiBaseUrl: "https://library.example/api/v1",
  accessToken: "test-token",
  verifiedUser: { profileId: "reader-1", username: "reader" },
  createdAt: "2026-01-01T00:00:00Z",
};

function book(): BookDetail {
  return {
    id: "book-1",
    title: "Offline Book",
    file: { format: "epub", fileSize: 4, checksum: "a".repeat(64) },
  } as unknown as BookDetail;
}

function onlineOpenedBook(value: BookDetail): OpenedBook {
  return {
    source: "online",
    book: value,
    blob: new Blob(["book"]),
    objectUrl: "blob:online",
    openedAt: "2026-01-01T00:00:00Z",
    bootstrap: { kind: "server", marginalia: {} as never },
    returnTarget: { kind: "home", label: "Home", route: "#/home" },
  };
}

function offlineOpenedBook(value: BookDetail): OfflineOpenedBook {
  return {
    source: "offline",
    book: value,
    blob: new Blob(["book"]),
    objectUrl: "blob:offline",
    openedAt: "2026-01-01T00:00:00Z",
    bootstrap: {
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
    },
    returnTarget: { kind: "home", label: "Home", route: "#/home" },
  };
}
