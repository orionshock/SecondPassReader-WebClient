import type { BookDetail, SecondPassClient } from "@secondpass/client";
import {
  getBrowserOfflinePersistenceCapability,
  type BrowserOfflineCapability,
} from "../browser/BrowserOfflineCapability.Queries";
import {
  requestBrowserPersistentStorage,
  type PersistentStorageRequestResult,
} from "../browser/BrowserPersistentStorage.Actions";
import {
  getBrowserStorageEstimate,
  type BrowserStorageEstimate,
} from "../browser/BrowserStorageEstimate.Queries";
import type { OfflineCacheNamespace } from "../namespace/OfflineCacheNamespace.Policy";
import { publishOfflineNamespaceMutation, type OfflineNamespacePublicationLease } from "../namespace/OfflineNamespacePublication.Lifecycle";
import {
  normalizePublicationChecksum,
  normalizePublicationFormat,
} from "./OfflinePublicationAsset.Policy";
import {
  verifyOfflinePublicationBlob,
  type OfflinePublicationVerificationResult,
} from "./OfflinePublicationVerification.Actions";
import type { OfflinePublicationAssetRepository } from "../storage/OfflineRepositories.Types";
import { classifyOfflineStorageAdmission } from "./OfflineStorageAdmission.Policy";

const OFFLINE_PUBLICATION_ASSET_SCHEMA_VERSION = 1;

type AcquisitionContext = {
  capability: BrowserOfflineCapability;
  persistence: PersistentStorageRequestResult | null;
};

type AcquiredAsset = AcquisitionContext & {
  namespaceKey: string;
  bookId: string;
  format: string;
  checksum: string;
  byteLength: number;
  fileSizeMismatch: boolean | null;
};

export type OfflinePublicationAcquisitionResult =
  | { status: "superseded" }
  | (AcquiredAsset & { status: "already-available" })
  | (AcquiredAsset & { status: "stored" })
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

export async function acquireOfflinePublicationAsset(input: {
  namespace: OfflineCacheNamespace;
  publication: OfflineNamespacePublicationLease;
  book: BookDetail;
  spl: SecondPassClient;
  repository: OfflinePublicationAssetRepository<Blob>;
  supportedFormat: string;
  requestPersistentStorage?: boolean;
}): Promise<OfflinePublicationAcquisitionResult> {
  const metadata = validateInput(input.namespace, input.book, input.supportedFormat);
  if (!metadata.ok) return { status: "unverifiable", reason: metadata.reason };
  if (input.publication.namespaceKey !== metadata.namespaceKey || !input.publication.isCurrent()) {
    return { status: "superseded" };
  }

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
    existingAsset = await input.repository.get(metadata.namespaceKey, metadata.bookId, metadata.format);
  } catch {
    return { status: "storage-failed", capability, persistence: null };
  }
  if (normalizePublicationChecksum(existingAsset?.checksum) === metadata.checksum) {
    return {
      status: "already-available",
      namespaceKey: metadata.namespaceKey,
      bookId: metadata.bookId,
      format: metadata.format,
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

  let verification: OfflinePublicationVerificationResult;
  try {
    verification = await verifyOfflinePublicationBlob({
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
    // Publish only a fully verified Blob; an interrupted or mismatched download must not replace a readable asset.
    const published = await publishOfflineNamespaceMutation(input.publication, async () => {
      const previous = await input.repository.get(metadata.namespaceKey, metadata.bookId, metadata.format);
      await input.repository.putComplete({
        status: "complete",
        namespaceKey: metadata.namespaceKey,
        bookId: metadata.bookId,
        format: metadata.format,
        checksum: verification.checksum,
        byteLength: verification.observedByteLength,
        schemaVersion: OFFLINE_PUBLICATION_ASSET_SCHEMA_VERSION,
        payload: blob,
      });
      return () => previous
        ? input.repository.putComplete(previous)
        : input.repository.delete(metadata.namespaceKey, metadata.bookId, metadata.format);
    });
    if (!published) return { status: "superseded" };
  } catch {
    return { status: "storage-failed", ...context };
  }

  return {
    status: "stored",
    namespaceKey: metadata.namespaceKey,
    bookId: metadata.bookId,
    format: metadata.format,
    checksum: verification.checksum,
    byteLength: verification.observedByteLength,
    fileSizeMismatch: verification.fileSizeMismatch,
    ...context,
  };
}

type ValidatedInput =
  | { ok: false; reason: Extract<OfflinePublicationAcquisitionResult, { status: "unverifiable" }>["reason"] }
  | {
      ok: true;
      namespaceKey: string;
      bookId: string;
      format: string;
      checksum: string;
      fileSize: number;
    };

function validateInput(
  namespace: OfflineCacheNamespace,
  book: BookDetail,
  supportedFormat: string,
): ValidatedInput {
  const namespaceKey = namespace?.key.trim();
  const bookId = book?.id?.trim();
  if (!namespaceKey || !bookId) return { ok: false, reason: "invalid-identity" };
  if (!book.file) return { ok: false, reason: "missing-file" };
  const format = normalizePublicationFormat(book.file.format);
  if (!format || format !== normalizePublicationFormat(supportedFormat)) {
    return { ok: false, reason: "unsupported-format" };
  }
  if (!Number.isFinite(book.file.fileSize) || book.file.fileSize < 0) {
    return { ok: false, reason: "invalid-file-size" };
  }
  const checksum = normalizePublicationChecksum(book.file.checksum);
  if (!checksum) return { ok: false, reason: "invalid-checksum" };

  return { ok: true, namespaceKey, bookId, format, checksum, fileSize: book.file.fileSize };
}
