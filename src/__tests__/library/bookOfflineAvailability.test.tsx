// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { BookDetail, SecondPassClient } from "@secondpass/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBrowserOfflinePersistenceCapability } from "../../app/offline/browser/BrowserOfflineCapability.Queries";
import { acquireOfflinePublicationAsset } from "../../app/offline/publication/OfflinePublicationAcquisition.Actions";
import { acquireOfflinePublicationCover } from "../../app/offline/publication/OfflinePublicationCover.Actions";
import { openIndexedDbOfflineRepositories } from "../../app/offline/storage/IndexedDbOfflineRepositories.Factory";
import type {
  OfflinePublicationAssetCompleteRecord,
  OfflinePublicationAssetRepository,
} from "../../app/offline/storage/OfflineRepositories.Types";
import { BookDetailPanel } from "../../features/library/BookDetailPanel.UI";
import {
  type BookOfflineAvailabilityController,
  useBookOfflineAvailabilityController,
} from "../../features/library/bookDetail/BookOfflineAvailability.Controller";
import { BookOfflineAvailabilityPanel } from "../../features/library/bookDetail/BookOfflineAvailabilityPanel.UI";
import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";

vi.mock("../../app/offline/browser/BrowserOfflineCapability.Queries", () => ({
  getBrowserOfflinePersistenceCapability: vi.fn(),
}));
vi.mock("../../app/offline/publication/OfflinePublicationAcquisition.Actions", () => ({
  acquireOfflinePublicationAsset: vi.fn(),
}));
vi.mock("../../app/offline/publication/OfflinePublicationCover.Actions", () => ({
  acquireOfflinePublicationCover: vi.fn(),
}));
vi.mock("../../app/offline/storage/IndexedDbOfflineRepositories.Factory", () => ({
  openIndexedDbOfflineRepositories: vi.fn(),
}));

const CHECKSUM_A = "a".repeat(64);
const CHECKSUM_B = "b".repeat(64);
const TEST_SPL = {} as SecondPassClient;
const capabilityMock = vi.mocked(getBrowserOfflinePersistenceCapability);
const acquisitionMock = vi.mocked(acquireOfflinePublicationAsset);
const coverAcquisitionMock = vi.mocked(acquireOfflinePublicationCover);
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
    coverAcquisitionMock.mockResolvedValue({ status: "unavailable" });
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

    expect(button("Make available offline")).toBeTruthy();
  });

  it("shows matching assets as available and changed checksums as needing an update", async () => {
    const repositories = repositorySet(completeAsset(CHECKSUM_B));
    repositoriesMock.mockResolvedValue(repositories.value);
    await renderController(book(CHECKSUM_B));
    expect(repositories.projections.put).toHaveBeenCalledWith(expect.objectContaining({
      namespaceKey: "server:https%3A%2F%2Flibrary.example|profile:reader-1",
      projectionKey: "reader-book:book-1",
      value: expect.objectContaining({ id: "book-1" }),
    }));
    expect(button("Remove offline copy")).toBeTruthy();

    act(() => root.unmount());
    root = createRoot(container);
    repositoriesMock.mockResolvedValue(repositorySet(completeAsset(CHECKSUM_A)).value);
    await renderController(book(CHECKSUM_B));
    expect(button("Update offline copy")).toBeTruthy();
  });

  it("offers Settings management for a retained offline asset without changing removal", async () => {
    const onManageOffline = vi.fn();
    const remove = vi.fn(async () => undefined);
    await act(async () => root.render(
      <BookOfflineAvailabilityPanel
        controller={{ state: { status: "available", message: null }, acquire: vi.fn(), remove }}
        onManageOffline={onManageOffline}
      />,
    ));

    await act(async () => button("Manage offline")?.click());
    expect(onManageOffline).toHaveBeenCalledOnce();
    await act(async () => button("Remove offline copy")?.click());
    expect(remove).toHaveBeenCalledOnce();
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
    expect(coverAcquisitionMock).toHaveBeenCalledWith(expect.objectContaining({
      repository: repositories.publicationCovers,
    }));
    expect(button("Remove offline copy")).toBeTruthy();
  });

  it("keeps a verified publication available when cover acquisition fails", async () => {
    const repositories = repositorySet();
    repositoriesMock.mockResolvedValue(repositories.value);
    acquisitionMock.mockImplementation(async () => {
      repositories.setAsset(completeAsset(CHECKSUM_B));
      return storedResult();
    });
    coverAcquisitionMock.mockResolvedValue({ status: "failed" });

    await renderController(book(CHECKSUM_B));
    await act(async () => button("Make available offline")?.click());

    expect(button("Remove offline copy")).toBeTruthy();
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
    expect(button("Update offline copy")).toBeTruthy();
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
    expect(repositories.publicationCovers.delete).toHaveBeenCalledWith(
      "server:https%3A%2F%2Flibrary.example|profile:reader-1",
      "book-1",
    );
    expect(repositories.projections.deleteNamespace).not.toHaveBeenCalled();
    expect(repositories.projections.delete).not.toHaveBeenCalled();
    expect(repositories.readerState.deleteNamespace).not.toHaveBeenCalled();
    expect(repositories.readerState.deleteBookState).not.toHaveBeenCalled();
    expect(repositories.readerOutbox.deleteNamespace).not.toHaveBeenCalled();
    expect(repositories.readerOutbox.remove).not.toHaveBeenCalled();
    expect(button("Make available offline")).toBeTruthy();
  });

  it("keeps an available asset visible when removal fails", async () => {
    const oldAsset = completeAsset(CHECKSUM_B);
    const repositories = repositorySet(oldAsset);
    vi.mocked(repositories.publicationAssets.delete).mockRejectedValueOnce(new Error("private database detail"));
    repositoriesMock.mockResolvedValue(repositories.value);

    await renderController(book(CHECKSUM_B));
    await act(async () => button("Remove offline copy")?.click());

    expect(repositories.asset()).toBe(oldAsset);
    expect(button("Remove offline copy")).toBeTruthy();
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
    expect(repositoriesMock).not.toHaveBeenCalled();

    act(() => root.unmount());
    root = createRoot(container);
    await renderController(book(null));
    expect(button("Make available offline")).toBeUndefined();
    expect(button("Open reader")).toBeUndefined();
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
        onManageOffline={vi.fn()}
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
  return <BookOfflineAvailabilityPanel controller={controller} onManageOffline={vi.fn()} />;
}

function button(label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent === label);
}

function repositorySet(initialAsset: OfflinePublicationAssetCompleteRecord<Blob> | null = null) {
  let asset = initialAsset;
  const publicationAssets: OfflinePublicationAssetRepository<Blob> = {
    get: vi.fn(async () => asset),
    list: vi.fn(async () => asset ? [asset] : []),
    putComplete: vi.fn(async (record) => { asset = record; }),
    delete: vi.fn(async () => { asset = null; }),
    deleteNamespace: vi.fn(async () => undefined),
  };
  const publicationCovers = {
    get: vi.fn(async () => null),
    put: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
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
    publicationCovers,
    value: { publicationAssets, publicationCovers, projections, readerState, readerOutbox, close: vi.fn() } as never,
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
