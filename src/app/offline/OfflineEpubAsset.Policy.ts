import type { OfflineCacheNamespace } from "./OfflineCacheNamespace.Policy";

export type OfflineEpubFileMetadata = {
  format?: string | null;
  checksum?: string | null;
  fileSize?: number | null;
  downloadUrl?: string | null;
};

export type OfflineEpubAssetRecord =
  | { status: "missing" }
  | { status: "partial"; byteLength?: number | null }
  | { status: "complete"; checksum?: string | null; byteLength?: number | null };

type CompleteAssetDiagnostic = {
  fileSizeMismatch: boolean | null;
};

export type OfflineEpubAssetAvailability =
  | { status: "unsupported"; reason: "missing-file-metadata" | "unsupported-format" }
  | { status: "metadata-only" }
  | { status: "missing" }
  | { status: "partial" }
  | ({ status: "unverifiable" } & CompleteAssetDiagnostic)
  | ({ status: "checksum-mismatch" } & CompleteAssetDiagnostic)
  | ({ status: "available" } & CompleteAssetDiagnostic);

export function classifyOfflineEpubAssetAvailability(input: {
  fileMetadata?: OfflineEpubFileMetadata | null;
  assetRecord?: OfflineEpubAssetRecord | null;
}): OfflineEpubAssetAvailability {
  const { fileMetadata, assetRecord } = input;
  if (!fileMetadata) return { status: "unsupported", reason: "missing-file-metadata" };
  if (fileMetadata.format?.trim().toLowerCase() !== "epub") {
    return { status: "unsupported", reason: "unsupported-format" };
  }

  if (!assetRecord) return { status: "metadata-only" };
  if (assetRecord.status === "missing") return { status: "missing" };
  if (assetRecord.status === "partial") return { status: "partial" };

  const fileSizeMismatch = getFileSizeMismatch(fileMetadata.fileSize, assetRecord.byteLength);
  const expectedChecksum = normalizeSha256(fileMetadata.checksum);
  const assetChecksum = normalizeSha256(assetRecord.checksum);
  if (!expectedChecksum || !assetChecksum) return { status: "unverifiable", fileSizeMismatch };
  if (expectedChecksum !== assetChecksum) return { status: "checksum-mismatch", fileSizeMismatch };

  return { status: "available", fileSizeMismatch };
}

export function canOpenOfflineEpubAsset(availability: OfflineEpubAssetAvailability): boolean {
  return availability.status === "available";
}

export function buildOfflineEpubAssetKey(input: {
  namespace?: OfflineCacheNamespace | null;
  bookId?: string | number | null;
  checksum?: string | null;
}): string | null {
  const namespaceKey = input.namespace?.key.trim();
  const bookId = input.bookId === null || input.bookId === undefined ? "" : String(input.bookId).trim();
  const checksum = normalizeSha256(input.checksum);
  if (!namespaceKey || !bookId || !checksum) return null;

  return `${namespaceKey}|book:${encodeURIComponent(bookId)}|checksum:${checksum}`;
}

export function shouldReplaceOfflineEpubAsset(input: {
  currentChecksum?: string | null;
  nextChecksum?: string | null;
}): boolean {
  const currentChecksum = normalizeSha256(input.currentChecksum);
  const nextChecksum = normalizeSha256(input.nextChecksum);
  return Boolean(currentChecksum && nextChecksum && currentChecksum !== nextChecksum);
}

function normalizeSha256(checksum: string | null | undefined): string | null {
  const value = checksum?.trim();
  return value && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null;
}

function getFileSizeMismatch(
  expectedSize: number | null | undefined,
  byteLength: number | null | undefined,
): boolean | null {
  if (!Number.isFinite(expectedSize) || !Number.isFinite(byteLength)) return null;
  return expectedSize !== byteLength;
}
