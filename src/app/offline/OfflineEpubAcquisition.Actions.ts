import type { BookDetail, SecondPassClient } from "@secondpass/client";
import {
  getBrowserOfflinePersistenceCapability,
  type BrowserOfflineCapability,
} from "./BrowserOfflineCapability.State";
import {
  requestBrowserPersistentStorage,
  type PersistentStorageRequestResult,
} from "./BrowserPersistentStorage.Actions";
import {
  getBrowserStorageEstimate,
  type BrowserStorageEstimate,
} from "./BrowserStorageEstimate.State";
import type { OfflineCacheNamespace } from "./OfflineCacheNamespace.Policy";
import { normalizeOfflineEpubChecksum } from "./OfflineEpubAsset.Policy";
import {
  verifyOfflineEpubBlob,
  type OfflineEpubVerificationResult,
} from "./OfflineEpubVerification.Actions";
import type { OfflineEpubAssetRepository } from "./OfflineRepositories.Types";
import { classifyOfflineStorageAdmission } from "./OfflineStorageAdmission.Policy";

const OFFLINE_EPUB_ASSET_SCHEMA_VERSION = 1;

type AcquisitionContext = {
  capability: BrowserOfflineCapability;
  persistence: PersistentStorageRequestResult | null;
};

type AcquiredAsset = AcquisitionContext & {
  namespaceKey: string;
  bookId: string;
  checksum: string;
  byteLength: number;
  fileSizeMismatch: boolean | null;
};

export type OfflineEpubAcquisitionResult =
  | (AcquiredAsset & { status: "already-available" | "stored" })
  | {
      status: "unsupported";
      reason: "capability-unavailable" | "capability-check-failed";
      capability: BrowserOfflineCapability | null;
    }
  | (AcquisitionContext & { status: "limited"; reason: "capacity-unavailable" })
  | (AcquisitionContext & { status: "insufficient-storage" })
  | {
      status: "unverifiable";
      reason: "invalid-identity" | "missing-file" | "unsupported-format" | "invalid-file-size" | "invalid-checksum";
    }
  | (AcquisitionContext & { status: "download-failed"; reason: "request-failed" | "empty-blob" })
  | (AcquisitionContext & { status: "verification-failed" })
  | (AcquisitionContext & {
      status: "checksum-mismatch";
      expectedChecksum: string;
      observedChecksum: string;
      byteLength: number;
      fileSizeMismatch: boolean | null;
    })
  | (AcquisitionContext & { status: "storage-failed" });

export async function acquireOfflineEpubAsset(input: {
  namespace: OfflineCacheNamespace;
  book: BookDetail;
  spl: SecondPassClient;
  repository: OfflineEpubAssetRepository<Blob>;
  requestPersistentStorage?: boolean;
}): Promise<OfflineEpubAcquisitionResult> {
  const metadata = validateInput(input.namespace, input.book);
  if (!metadata.ok) return { status: "unverifiable", reason: metadata.reason };

  let capability: BrowserOfflineCapability;
  try {
    capability = await getBrowserOfflinePersistenceCapability();
  } catch {
    return { status: "unsupported", reason: "capability-check-failed", capability: null };
  }
  if (capability.status === "unavailable") {
    return { status: "unsupported", reason: "capability-unavailable", capability };
  }

  let existingAsset;
  try {
    existingAsset = await input.repository.get(metadata.namespaceKey, metadata.bookId);
  } catch {
    return { status: "storage-failed", capability, persistence: null };
  }
  if (normalizeOfflineEpubChecksum(existingAsset?.checksum) === metadata.checksum) {
    return {
      status: "already-available",
      namespaceKey: metadata.namespaceKey,
      bookId: metadata.bookId,
      checksum: metadata.checksum,
      byteLength: existingAsset!.byteLength,
      fileSizeMismatch: existingAsset!.byteLength !== metadata.fileSize,
      capability,
      persistence: null,
    };
  }

  let estimate: BrowserStorageEstimate;
  try {
    estimate = await getBrowserStorageEstimate();
  } catch {
    return {
      status: "limited",
      reason: "capacity-unavailable",
      capability,
      persistence: null,
    };
  }
  const admission = classifyOfflineStorageAdmission({
    assetSizeBytes: metadata.fileSize,
    estimate,
  });
  if (admission.status === "insufficient") {
    return { status: "insufficient-storage", capability, persistence: null };
  }
  if (admission.status !== "available") {
    return {
      status: "limited",
      reason: "capacity-unavailable",
      capability,
      persistence: null,
    };
  }

  let persistence: PersistentStorageRequestResult | null = null;
  if (input.requestPersistentStorage === true) {
    try {
      persistence = await requestBrowserPersistentStorage();
    } catch {
      persistence = { status: "failed" };
    }
  }
  const context = { capability, persistence };

  let blob: Blob;
  try {
    blob = await input.spl.library.books.download(input.book);
  } catch {
    return { status: "download-failed", reason: "request-failed", ...context };
  }
  if (blob.size === 0) {
    return { status: "download-failed", reason: "empty-blob", ...context };
  }

  let verification: OfflineEpubVerificationResult;
  try {
    verification = await verifyOfflineEpubBlob({
      blob,
      expectedChecksum: metadata.checksum,
      expectedFileSize: metadata.fileSize,
    });
  } catch {
    return { status: "verification-failed", ...context };
  }
  if (verification.status === "unverifiable") {
    return { status: "unverifiable", reason: "invalid-checksum" };
  }
  if (verification.status === "failed") {
    return { status: "verification-failed", ...context };
  }
  if (verification.status === "checksum-mismatch") {
    return {
      status: "checksum-mismatch",
      expectedChecksum: verification.expectedChecksum,
      observedChecksum: verification.observedChecksum,
      byteLength: verification.observedByteLength,
      fileSizeMismatch: verification.fileSizeMismatch,
      ...context,
    };
  }

  try {
    await input.repository.putComplete({
      status: "complete",
      namespaceKey: metadata.namespaceKey,
      bookId: metadata.bookId,
      checksum: verification.checksum,
      byteLength: verification.observedByteLength,
      schemaVersion: OFFLINE_EPUB_ASSET_SCHEMA_VERSION,
      payload: blob,
    });
  } catch {
    return { status: "storage-failed", ...context };
  }

  return {
    status: "stored",
    namespaceKey: metadata.namespaceKey,
    bookId: metadata.bookId,
    checksum: verification.checksum,
    byteLength: verification.observedByteLength,
    fileSizeMismatch: verification.fileSizeMismatch,
    ...context,
  };
}

type ValidatedInput =
  | { ok: false; reason: Extract<OfflineEpubAcquisitionResult, { status: "unverifiable" }>["reason"] }
  | {
      ok: true;
      namespaceKey: string;
      bookId: string;
      checksum: string;
      fileSize: number;
    };

function validateInput(namespace: OfflineCacheNamespace, book: BookDetail): ValidatedInput {
  const namespaceKey = namespace?.key.trim();
  const bookId = book?.id?.trim();
  if (!namespaceKey || !bookId) return { ok: false, reason: "invalid-identity" };
  if (!book.file) return { ok: false, reason: "missing-file" };
  if (book.file.format.trim().toLowerCase() !== "epub") {
    return { ok: false, reason: "unsupported-format" };
  }
  if (!Number.isFinite(book.file.fileSize) || book.file.fileSize < 0) {
    return { ok: false, reason: "invalid-file-size" };
  }
  const checksum = normalizeOfflineEpubChecksum(book.file.checksum);
  if (!checksum) return { ok: false, reason: "invalid-checksum" };

  return { ok: true, namespaceKey, bookId, checksum, fileSize: book.file.fileSize };
}
