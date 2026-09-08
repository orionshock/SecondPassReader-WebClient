import type { BookDetail, SecondPassClient } from "@secondpass/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserOfflineCapability } from "../app/offline/BrowserOfflineCapability.State";
import { getBrowserOfflinePersistenceCapability } from "../app/offline/BrowserOfflineCapability.State";
import { requestBrowserPersistentStorage } from "../app/offline/BrowserPersistentStorage.Actions";
import { getBrowserStorageEstimate } from "../app/offline/BrowserStorageEstimate.State";
import type { OfflineCacheNamespace } from "../app/offline/OfflineCacheNamespace.Policy";
import { acquireOfflineEpubAsset } from "../app/offline/OfflineEpubAcquisition.Actions";
import { verifyOfflineEpubBlob } from "../app/offline/OfflineEpubVerification.Actions";
import type {
  OfflineEpubAssetCompleteRecord,
  OfflineEpubAssetRepository,
} from "../app/offline/OfflineRepositories.Types";
import { classifyOfflineStorageAdmission } from "../app/offline/OfflineStorageAdmission.Policy";

vi.mock("../app/offline/BrowserOfflineCapability.State", () => ({
  getBrowserOfflinePersistenceCapability: vi.fn(),
}));
vi.mock("../app/offline/BrowserPersistentStorage.Actions", () => ({
  requestBrowserPersistentStorage: vi.fn(),
}));
vi.mock("../app/offline/BrowserStorageEstimate.State", () => ({
  getBrowserStorageEstimate: vi.fn(),
}));
vi.mock("../app/offline/OfflineEpubVerification.Actions", () => ({
  verifyOfflineEpubBlob: vi.fn(),
}));
vi.mock("../app/offline/OfflineStorageAdmission.Policy", () => ({
  classifyOfflineStorageAdmission: vi.fn(),
}));

const CHECKSUM_A = "a".repeat(64);
const CHECKSUM_B = "b".repeat(64);
const CAPABILITY_SUPPORTED: BrowserOfflineCapability = {
  status: "supported",
  indexedDbAvailable: true,
  storageEstimateAvailable: true,
  persistentStorageSupported: true,
  persistentStorageGranted: false,
  reason: null,
};
const CAPABILITY_LIMITED: BrowserOfflineCapability = {
  ...CAPABILITY_SUPPORTED,
  status: "limited",
  persistentStorageSupported: false,
  reason: "persistent-storage-unavailable",
};
const CAPABILITY_UNAVAILABLE: BrowserOfflineCapability = {
  status: "unavailable",
  indexedDbAvailable: false,
  storageEstimateAvailable: false,
  persistentStorageSupported: false,
  persistentStorageGranted: null,
  reason: "indexeddb-unavailable",
};

const capabilityMock = vi.mocked(getBrowserOfflinePersistenceCapability);
const estimateMock = vi.mocked(getBrowserStorageEstimate);
const admissionMock = vi.mocked(classifyOfflineStorageAdmission);
const persistenceMock = vi.mocked(requestBrowserPersistentStorage);
const verificationMock = vi.mocked(verifyOfflineEpubBlob);

describe("offline EPUB acquisition", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    capabilityMock.mockResolvedValue(CAPABILITY_SUPPORTED);
    estimateMock.mockResolvedValue({
      status: "available",
      usageBytes: 100,
      quotaBytes: 1_000,
      availableBytes: 900,
    });
    admissionMock.mockReturnValue({
      status: "available",
      safetyReserveBytes: 100,
      usableBudgetBytes: 900,
    });
    persistenceMock.mockResolvedValue({ status: "granted" });
    verificationMock.mockResolvedValue(verified(CHECKSUM_B));
  });

  it("returns an existing matching asset without downloading or requesting persistence", async () => {
    const asset = completeAsset(CHECKSUM_B, new Blob(["current"]));
    const store = assetStore(asset);
    const client = downloadClient(new Blob(["unused"]));

    const result = await acquireOfflineEpubAsset(acquisitionInput(client, store.repository, {
      requestPersistentStorage: true,
    }));

    expect(result).toMatchObject({ status: "already-available", checksum: CHECKSUM_B });
    expect(estimateMock).not.toHaveBeenCalled();
    expect(persistenceMock).not.toHaveBeenCalled();
    expect(client.download).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
  });

  it("keeps the old asset until a changed checksum is verified and committed", async () => {
    const oldAsset = completeAsset(CHECKSUM_A, new Blob(["old"]));
    const newBlob = new Blob(["new"]);
    const store = assetStore(oldAsset);
    const client = downloadClient(newBlob);
    verificationMock.mockImplementation(async () => {
      expect(store.current()).toBe(oldAsset);
      return verified(CHECKSUM_B);
    });

    const result = await acquireOfflineEpubAsset(acquisitionInput(client, store.repository));

    expect(result.status).toBe("stored");
    expect(store.current()).toMatchObject({ checksum: CHECKSUM_B, payload: newBlob });
    expect(store.put).toHaveBeenCalledTimes(1);
  });

  it("leaves an old asset intact when replacement verification fails", async () => {
    const oldAsset = completeAsset(CHECKSUM_A, new Blob(["old"]));
    const store = assetStore(oldAsset);
    verificationMock.mockResolvedValue({
      status: "failed",
      observedByteLength: 3,
      fileSizeMismatch: false,
    });

    const result = await acquireOfflineEpubAsset(acquisitionInput(
      downloadClient(new Blob(["new"])),
      store.repository,
    ));

    expect(result.status).toBe("verification-failed");
    expect(store.current()).toBe(oldAsset);
    expect(store.put).not.toHaveBeenCalled();
  });

  it("stops before download when browser persistence is unavailable", async () => {
    capabilityMock.mockResolvedValue(CAPABILITY_UNAVAILABLE);
    const store = assetStore();
    const client = downloadClient(new Blob(["unused"]));

    const result = await acquireOfflineEpubAsset(acquisitionInput(client, store.repository));

    expect(result.status).toBe("unsupported");
    expect(client.download).not.toHaveBeenCalled();
    expect(estimateMock).not.toHaveBeenCalled();
  });

  it("allows limited browser capability to store best-effort", async () => {
    capabilityMock.mockResolvedValue(CAPABILITY_LIMITED);
    const store = assetStore();

    const result = await acquireOfflineEpubAsset(acquisitionInput(
      downloadClient(new Blob(["new"])),
      store.repository,
    ));

    expect(result).toMatchObject({ status: "stored", capability: CAPABILITY_LIMITED });
  });

  it("stops before download when quota admission is insufficient", async () => {
    admissionMock.mockReturnValue({
      status: "insufficient",
      safetyReserveBytes: 100,
      usableBudgetBytes: 200,
    });
    const store = assetStore();
    const client = downloadClient(new Blob(["unused"]));

    const result = await acquireOfflineEpubAsset(acquisitionInput(client, store.repository));

    expect(result.status).toBe("insufficient-storage");
    expect(admissionMock).toHaveBeenCalledWith({
      assetSizeBytes: 3,
      estimate: {
        status: "available",
        usageBytes: 100,
        quotaBytes: 1_000,
        availableBytes: 900,
      },
    });
    expect(client.download).not.toHaveBeenCalled();
  });

  it.each(["denied", "failed"] as const)(
    "continues best-effort storage when persistence is %s",
    async (persistenceStatus) => {
      persistenceMock.mockResolvedValue({ status: persistenceStatus });
      const store = assetStore();

      const result = await acquireOfflineEpubAsset(acquisitionInput(
        downloadClient(new Blob(["new"])),
        store.repository,
        { requestPersistentStorage: true },
      ));

      expect(result).toMatchObject({
        status: "stored",
        persistence: { status: persistenceStatus },
      });
      expect(persistenceMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([null, "not-a-checksum"])(
    "returns unverifiable and skips download for checksum %s",
    async (checksum) => {
      const store = assetStore();
      const client = downloadClient(new Blob(["unused"]));

      const result = await acquireOfflineEpubAsset(acquisitionInput(client, store.repository, {
        book: book(checksum),
      }));

      expect(result).toEqual({ status: "unverifiable", reason: "invalid-checksum" });
      expect(capabilityMock).not.toHaveBeenCalled();
      expect(client.download).not.toHaveBeenCalled();
    },
  );

  it("rejects an empty download without verification or publish", async () => {
    const store = assetStore();

    const result = await acquireOfflineEpubAsset(acquisitionInput(
      downloadClient(new Blob([])),
      store.repository,
    ));

    expect(result.status).toBe("download-failed");
    expect(verificationMock).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
  });

  it("does not publish checksum-mismatched bytes", async () => {
    const store = assetStore();
    verificationMock.mockResolvedValue({
      status: "checksum-mismatch",
      expectedChecksum: CHECKSUM_B,
      observedChecksum: CHECKSUM_A,
      observedByteLength: 3,
      fileSizeMismatch: false,
    });

    const result = await acquireOfflineEpubAsset(acquisitionInput(
      downloadClient(new Blob(["new"])),
      store.repository,
    ));

    expect(result).toMatchObject({
      status: "checksum-mismatch",
      expectedChecksum: CHECKSUM_B,
      observedChecksum: CHECKSUM_A,
    });
    expect(store.put).not.toHaveBeenCalled();
  });

  it("publishes one complete record only after successful verification", async () => {
    const blob = new Blob(["new"]);
    const store = assetStore();

    const result = await acquireOfflineEpubAsset(acquisitionInput(downloadClient(blob), store.repository));

    expect(result).toMatchObject({
      status: "stored",
      namespaceKey: "account-a",
      bookId: "book-1",
      checksum: CHECKSUM_B,
      byteLength: 3,
      fileSizeMismatch: false,
    });
    expect(store.put).toHaveBeenCalledTimes(1);
    expect(store.put).toHaveBeenCalledWith({
      status: "complete",
      namespaceKey: "account-a",
      bookId: "book-1",
      checksum: CHECKSUM_B,
      byteLength: 3,
      schemaVersion: 1,
      payload: blob,
    });
  });

  it("normalizes repository publish failure without replacing the old asset", async () => {
    const oldAsset = completeAsset(CHECKSUM_A, new Blob(["old"]));
    const store = assetStore(oldAsset, new Error("sensitive storage failure"));

    const result = await acquireOfflineEpubAsset(acquisitionInput(
      downloadClient(new Blob(["new"])),
      store.repository,
    ));

    expect(result.status).toBe("storage-failed");
    expect(store.current()).toBe(oldAsset);
    expect(JSON.stringify(result)).not.toContain("sensitive storage failure");
  });

  it("normalizes download errors without leaking request details", async () => {
    const store = assetStore();
    const client = downloadClient(Promise.reject(
      new Error("https://library.example/private.epub?token=secret"),
    ));

    const result = await acquireOfflineEpubAsset(acquisitionInput(client, store.repository));

    expect(result).toMatchObject({ status: "download-failed", reason: "request-failed" });
    expect(JSON.stringify(result)).not.toContain("library.example");
    expect(store.put).not.toHaveBeenCalled();
  });
});

function acquisitionInput(
  client: ReturnType<typeof downloadClient>,
  repository: OfflineEpubAssetRepository<Blob>,
  overrides: { requestPersistentStorage?: boolean; book?: BookDetail } = {},
) {
  return {
    namespace: {
      serverOrigin: "https://library.example",
      accountProfileId: "profile-1",
      key: "account-a",
    } satisfies OfflineCacheNamespace,
    book: overrides.book ?? book(CHECKSUM_B),
    spl: client.spl,
    repository,
    requestPersistentStorage: overrides.requestPersistentStorage,
  };
}

function book(checksum: string | null): BookDetail {
  return {
    id: "book-1",
    file: {
      format: "epub",
      fileSize: 3,
      checksum: checksum as string,
      downloadUrl: "https://library.example/private.epub",
    },
  } as BookDetail;
}

function downloadClient(result: Blob | Promise<Blob>) {
  const download = vi.fn(async () => result);
  return {
    download,
    spl: { library: { books: { download } } } as unknown as SecondPassClient,
  };
}

function completeAsset(
  checksum: string,
  payload: Blob,
): OfflineEpubAssetCompleteRecord<Blob> {
  return {
    status: "complete",
    namespaceKey: "account-a",
    bookId: "book-1",
    checksum,
    byteLength: payload.size,
    schemaVersion: 1,
    payload,
  };
}

function assetStore(
  initial: OfflineEpubAssetCompleteRecord<Blob> | null = null,
  putFailure?: Error,
) {
  let current = initial;
  const put = vi.fn(async (record: OfflineEpubAssetCompleteRecord<Blob>) => {
    if (putFailure) throw putFailure;
    current = record;
  });
  const repository: OfflineEpubAssetRepository<Blob> = {
    get: vi.fn(async () => current),
    putComplete: put,
    delete: vi.fn(async () => undefined),
    deleteNamespace: vi.fn(async () => undefined),
  };
  return { repository, put, current: () => current };
}

function verified(checksum: string) {
  return {
    status: "verified" as const,
    checksum,
    observedByteLength: 3,
    fileSizeMismatch: false,
  };
}
