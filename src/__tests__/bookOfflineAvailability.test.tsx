// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { BookDetail, SecondPassClient } from "@secondpass/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBrowserOfflinePersistenceCapability } from "../app/offline/BrowserOfflineCapability.State";
import { acquireOfflinePublicationAsset } from "../app/offline/OfflinePublicationAcquisition.Actions";
import { openIndexedDbOfflineRepositories } from "../app/offline/OfflineRepositories.IndexedDb";
import type {
  OfflinePublicationAssetCompleteRecord,
  OfflinePublicationAssetRepository,
} from "../app/offline/OfflineRepositories.Types";
import { BookDetailPanel } from "../features/library/BookDetail.Panel";
import {
  type BookOfflineAvailabilityController,
  useBookOfflineAvailabilityController,
} from "../features/library/bookDetail/BookOfflineAvailability.Controller";
import { BookOfflineAvailabilityPanel } from "../features/library/bookDetail/BookOfflineAvailability.Panel";
import type { ConnectionProfile } from "../storage/ConnectionProfiles.Store";

vi.mock("../app/offline/BrowserOfflineCapability.State", () => ({
  getBrowserOfflinePersistenceCapability: vi.fn(),
}));
vi.mock("../app/offline/OfflinePublicationAcquisition.Actions", () => ({
  acquireOfflinePublicationAsset: vi.fn(),
}));
vi.mock("../app/offline/OfflineRepositories.IndexedDb", () => ({
  openIndexedDbOfflineRepositories: vi.fn(),
}));

const CHECKSUM_A = "a".repeat(64);
const CHECKSUM_B = "b".repeat(64);
const TEST_SPL = {} as SecondPassClient;
const capabilityMock = vi.mocked(getBrowserOfflinePersistenceCapability);
const acquisitionMock = vi.mocked(acquireOfflinePublicationAsset);
const repositoriesMock = vi.mocked(openIndexedDbOfflineRepositories);

let root: Root;
let container: HTMLDivElement;

describe("Book Detail offline availability", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    capabilityMock.mockResolvedValue({
      status: "supported",
      indexedDbAvailable: true,
      storageEstimateAvailable: true,
      persistentStorageSupported: true,
      persistentStorageGranted: false,
      reason: null,
    });
    acquisitionMock.mockResolvedValue(storedResult());
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.resetAllMocks();
  });

  it("offers acquisition when no EPUB asset is stored", async () => {
    const repositories = repositorySet();
    repositoriesMock.mockResolvedValue(repositories.value);

    await renderController(book(CHECKSUM_B));

    expect(container.textContent).toContain("Not available offline");
    expect(button("Make available offline")).toBeTruthy();
  });

  it("shows matching assets as available and changed checksums as needing an update", async () => {
    const repositories = repositorySet(completeAsset(CHECKSUM_B));
    repositoriesMock.mockResolvedValue(repositories.value);
    await renderController(book(CHECKSUM_B));
    expect(container.textContent).toContain("Available offline");
    expect(button("Remove offline copy")).toBeTruthy();

    act(() => root.unmount());
    root = createRoot(container);
    repositoriesMock.mockResolvedValue(repositorySet(completeAsset(CHECKSUM_A)).value);
    await renderController(book(CHECKSUM_B));
    expect(container.textContent).toContain("Offline copy needs updating");
    expect(button("Update offline copy")).toBeTruthy();
  });

  it("acquires with a user-driven persistence request and adopts the stored result", async () => {
    const repositories = repositorySet();
    repositoriesMock.mockResolvedValue(repositories.value);
    acquisitionMock.mockImplementation(async () => {
      repositories.setAsset(completeAsset(CHECKSUM_B));
      return storedResult();
    });

    await renderController(book(CHECKSUM_B));
    await act(async () => button("Make available offline")?.click());

    expect(acquisitionMock).toHaveBeenCalledWith(expect.objectContaining({
      repository: repositories.publicationAssets,
      supportedFormat: "epub",
      requestPersistentStorage: true,
    }));
    expect(container.textContent).toContain("Available offline");
  });

  it("keeps a previous asset update state when replacement fails", async () => {
    const oldAsset = completeAsset(CHECKSUM_A);
    const repositories = repositorySet(oldAsset);
    repositoriesMock.mockResolvedValue(repositories.value);
    acquisitionMock.mockResolvedValue({
      status: "checksum-mismatch",
      capability: supportedCapability(),
      persistence: { status: "denied" },
      expectedChecksum: CHECKSUM_B,
      observedChecksum: CHECKSUM_A,
      byteLength: 3,
      fileSizeMismatch: false,
    });

    await renderController(book(CHECKSUM_B));
    await act(async () => button("Update offline copy")?.click());

    expect(repositories.asset()).toBe(oldAsset);
    expect(container.textContent).toContain("Offline copy needs updating");
    expect(container.textContent).toContain("could not be prepared");
  });

  it("removes only the EPUB asset and returns to the acquisition state", async () => {
    const repositories = repositorySet(completeAsset(CHECKSUM_B));
    repositoriesMock.mockResolvedValue(repositories.value);

    await renderController(book(CHECKSUM_B));
    await act(async () => button("Remove offline copy")?.click());

    expect(repositories.publicationAssets.delete).toHaveBeenCalledWith(
      "server:https%3A%2F%2Flibrary.example|profile:reader-1",
      "book-1",
      "epub",
    );
    expect(repositories.projections.deleteNamespace).not.toHaveBeenCalled();
    expect(repositories.projections.delete).not.toHaveBeenCalled();
    expect(repositories.readerState.deleteNamespace).not.toHaveBeenCalled();
    expect(repositories.readerState.deleteBookState).not.toHaveBeenCalled();
    expect(repositories.readerOutbox.deleteNamespace).not.toHaveBeenCalled();
    expect(repositories.readerOutbox.remove).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Not available offline");
  });

  it("keeps an available asset visible when removal fails", async () => {
    const oldAsset = completeAsset(CHECKSUM_B);
    const repositories = repositorySet(oldAsset);
    vi.mocked(repositories.publicationAssets.delete).mockRejectedValueOnce(new Error("private database detail"));
    repositoriesMock.mockResolvedValue(repositories.value);

    await renderController(book(CHECKSUM_B));
    await act(async () => button("Remove offline copy")?.click());

    expect(repositories.asset()).toBe(oldAsset);
    expect(container.textContent).toContain("Available offline");
    expect(container.textContent).toContain("could not be removed");
    expect(container.textContent).not.toContain("private database detail");
  });

  it("reports insufficient storage while leaving acquisition retryable", async () => {
    const repositories = repositorySet();
    repositoriesMock.mockResolvedValue(repositories.value);
    acquisitionMock.mockResolvedValue({
      status: "insufficient-storage",
      capability: supportedCapability(),
      persistence: null,
    });

    await renderController(book(CHECKSUM_B));
    await act(async () => button("Make available offline")?.click());

    expect(container.textContent).toContain("Not enough storage");
    expect(button("Make available offline")).toBeTruthy();
  });

  it("does not claim availability when browser storage is unsupported or the Book is unverifiable", async () => {
    capabilityMock.mockResolvedValue({
      status: "unavailable",
      indexedDbAvailable: false,
      storageEstimateAvailable: false,
      persistentStorageSupported: false,
      persistentStorageGranted: null,
      reason: "indexeddb-unavailable",
    });
    await renderController(book(CHECKSUM_B));
    expect(container.textContent).toContain("Offline storage unavailable");
    expect(repositoriesMock).not.toHaveBeenCalled();

    act(() => root.unmount());
    root = createRoot(container);
    await renderController(book(null));
    expect(container.textContent).toContain("Offline copy unavailable");
    expect(container.textContent).not.toContain("Available offline");
  });

  it("blocks duplicate acquisition while work is in progress", async () => {
    const repositories = repositorySet();
    repositoriesMock.mockResolvedValue(repositories.value);
    let finishAcquisition: (() => void) | undefined;
    acquisitionMock.mockImplementation(() => new Promise((resolve) => {
      finishAcquisition = () => resolve(storedResult());
    }));
    let controller: BookOfflineAvailabilityController | null = null;
    await renderController(book(CHECKSUM_B), (next) => { controller = next; });

    act(() => {
      void controller!.acquire();
      void controller!.acquire();
    });

    expect(acquisitionMock).toHaveBeenCalledTimes(1);
    expect(button("Preparing offline copy...")?.disabled).toBe(true);
    await act(async () => finishAcquisition?.());
  });

  it("keeps normal Reader controls enabled while an offline copy is being prepared", () => {
    const onOpenReader = vi.fn();
    act(() => root.render(
      <BookDetailPanel
        book={book(CHECKSUM_B)}
        serverBaseUrl="https://library.example"
        launchMessage={null}
        onOpenReader={onOpenReader}
        onViewSessions={vi.fn()}
        onViewAuthor={vi.fn()}
        onViewSeries={vi.fn()}
        onViewTag={vi.fn()}
        onManageShelves={vi.fn()}
        spl={null}
        activitySummary={{ sessionCount: 1 } as never}
        downloadState={{ phase: "idle" }}
        offlineAvailability={{
          state: { status: "working", operation: "acquire" },
          acquire: vi.fn(),
          remove: vi.fn(),
        }}
      />,
    ));

    const openReader = button("Open reader");
    expect(openReader?.disabled).toBe(false);
    act(() => openReader?.click());
    expect(onOpenReader).toHaveBeenCalledTimes(1);
  });

  it("normalizes action failures without rendering raw URLs", async () => {
    const repositories = repositorySet();
    repositoriesMock.mockResolvedValue(repositories.value);
    acquisitionMock.mockRejectedValue(new Error("https://library.example/private.epub?token=secret"));

    await renderController(book(CHECKSUM_B));
    await act(async () => button("Make available offline")?.click());

    expect(container.textContent).toContain("could not be prepared");
    expect(container.textContent).not.toContain("library.example");
    expect(container.textContent).not.toContain("secret");
  });
});

async function renderController(
  value: BookDetail,
  observe?: (controller: BookOfflineAvailabilityController) => void,
) {
  await act(async () => root.render(
    <ControllerHarness book={value} observe={observe} />,
  ));
}

function ControllerHarness({
  book: value,
  observe,
}: {
  book: BookDetail;
  observe?: (controller: BookOfflineAvailabilityController) => void;
}) {
  const controller = useBookOfflineAvailabilityController({
    profile: profile(),
    book: value,
    spl: TEST_SPL,
  });
  useEffect(() => observe?.(controller), [controller, observe]);
  return <BookOfflineAvailabilityPanel controller={controller} />;
}

function button(label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent === label);
}

function repositorySet(initialAsset: OfflinePublicationAssetCompleteRecord<Blob> | null = null) {
  let asset = initialAsset;
  const publicationAssets: OfflinePublicationAssetRepository<Blob> = {
    get: vi.fn(async () => asset),
    putComplete: vi.fn(async (record) => { asset = record; }),
    delete: vi.fn(async () => { asset = null; }),
    deleteNamespace: vi.fn(async () => undefined),
  };
  const projections = {
    get: vi.fn(), put: vi.fn(), delete: vi.fn(), deleteNamespace: vi.fn(),
  };
  const readerState = {
    getBookState: vi.fn(), putBookState: vi.fn(), deleteBookState: vi.fn(), deleteNamespace: vi.fn(),
  };
  const readerOutbox = {
    list: vi.fn(), upsertIntent: vi.fn(), remove: vi.fn(), deleteNamespace: vi.fn(),
  };
  return {
    publicationAssets,
    projections,
    readerState,
    readerOutbox,
    value: { publicationAssets, projections, readerState, readerOutbox, close: vi.fn() } as never,
    asset: () => asset,
    setAsset: (next: OfflinePublicationAssetCompleteRecord<Blob>) => { asset = next; },
  };
}

function book(checksum: string | null): BookDetail {
  return {
    id: "book-1",
    title: "Offline Book",
    subtitle: "",
    description: "",
    authors: [],
    catalogTags: [],
    groups: [],
    file: {
      format: "epub",
      fileSize: 3,
      checksum: checksum as string,
      downloadUrl: "https://library.example/private.epub",
    },
  } as unknown as BookDetail;
}

function profile(): ConnectionProfile {
  return {
    id: "connection-1",
    label: "Library",
    serverBaseUrl: "https://library.example",
    verifiedUser: { profileId: "reader-1", username: "reader" },
    createdAt: "2026-01-01T00:00:00Z",
  };
}

function completeAsset(checksum: string): OfflinePublicationAssetCompleteRecord<Blob> {
  const payload = new Blob(["old"]);
  return {
    status: "complete",
    namespaceKey: "server:https%3A%2F%2Flibrary.example|profile:reader-1",
    bookId: "book-1",
    format: "epub",
    checksum,
    byteLength: payload.size,
    schemaVersion: 1,
    payload,
  };
}

function supportedCapability() {
  return {
    status: "supported" as const,
    indexedDbAvailable: true,
    storageEstimateAvailable: true,
    persistentStorageSupported: true,
    persistentStorageGranted: false,
    reason: null,
  };
}

function storedResult() {
  return {
    status: "stored" as const,
    namespaceKey: "server:https%3A%2F%2Flibrary.example|profile:reader-1",
    bookId: "book-1",
    format: "epub",
    checksum: CHECKSUM_B,
    byteLength: 3,
    fileSizeMismatch: false,
    capability: supportedCapability(),
    persistence: { status: "granted" as const },
  };
}
