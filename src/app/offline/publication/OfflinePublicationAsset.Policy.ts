import type { OfflineCacheNamespace } from "../namespace/OfflineCacheNamespace.Policy";
import type { OfflinePublicationAssetCompleteRecord } from "../storage/OfflineRepositories.Types";

export type OfflinePublicationFileMetadata = {
  format?: string | null;
  checksum?: string | null;
  fileSize?: number | null;
  downloadUrl?: string | null;
};

export type OfflinePublicationAssetRecord =
  | { status: "missing" }
  | { status: "partial"; format?: string | null; byteLength?: number | null }
  | { status: "complete"; format?: string | null; checksum?: string | null; byteLength?: number | null };

type CompleteAssetDiagnostic = {
  fileSizeMismatch: boolean | null;
};

export type OfflinePublicationAssetAvailability =
  | { status: "unsupported"; reason: "missing-file-metadata" | "missing-format" }
  | { status: "metadata-only" }
  | { status: "missing" }
  | { status: "partial" }
  | ({ status: "unverifiable" } & CompleteAssetDiagnostic)
  | ({ status: "format-mismatch" } & CompleteAssetDiagnostic)
  | ({ status: "checksum-mismatch" } & CompleteAssetDiagnostic)
  | ({ status: "available" } & CompleteAssetDiagnostic);

export function classifyOfflinePublicationAssetAvailability(input: {
  fileMetadata?: OfflinePublicationFileMetadata | null;
  assetRecord?: OfflinePublicationAssetRecord | null;
}): OfflinePublicationAssetAvailability {
  const { fileMetadata, assetRecord } = input;
  if (!fileMetadata) return { status: "unsupported", reason: "missing-file-metadata" };
  const expectedFormat = normalizePublicationFormat(fileMetadata.format);
  if (!expectedFormat) return { status: "unsupported", reason: "missing-format" };

  if (!assetRecord) return { status: "metadata-only" };
  if (assetRecord.status === "missing") return { status: "missing" };
  if (assetRecord.status === "partial") return { status: "partial" };

  const fileSizeMismatch = getFileSizeMismatch(fileMetadata.fileSize, assetRecord.byteLength);
  const assetFormat = normalizePublicationFormat(assetRecord.format);
  const expectedChecksum = normalizePublicationChecksum(fileMetadata.checksum);
  const assetChecksum = normalizePublicationChecksum(assetRecord.checksum);
  if (!assetFormat || !expectedChecksum || !assetChecksum) {
    return { status: "unverifiable", fileSizeMismatch };
  }
  if (expectedFormat !== assetFormat) return { status: "format-mismatch", fileSizeMismatch };
  if (expectedChecksum !== assetChecksum) return { status: "checksum-mismatch", fileSizeMismatch };

  return { status: "available", fileSizeMismatch };
}

export function isVerifiedOfflinePublicationAsset(
  availability: OfflinePublicationAssetAvailability,
): boolean {
  return availability.status === "available";
}

export function getOfflinePublicationPayloadBytes(
  asset: OfflinePublicationAssetCompleteRecord<Blob>,
): number {
  return asset.payload instanceof Blob ? asset.payload.size : 0;
}

export function hasCompleteOfflinePublicationPayload(
  asset: OfflinePublicationAssetCompleteRecord<Blob>,
): boolean {
  return asset.payload instanceof Blob && asset.payload.size === asset.byteLength;
}

export function buildOfflinePublicationAssetKey(input: {
  namespace?: OfflineCacheNamespace | null;
  bookId?: string | number | null;
  format?: string | null;
  checksum?: string | null;
}): string | null {
  const namespaceKey = input.namespace?.key.trim();
  const bookId = input.bookId === null || input.bookId === undefined ? "" : String(input.bookId).trim();
  const format = normalizePublicationFormat(input.format);
  const checksum = normalizePublicationChecksum(input.checksum);
  if (!namespaceKey || !bookId || !format || !checksum) return null;

  return `${namespaceKey}|book:${encodeURIComponent(bookId)}|format:${encodeURIComponent(format)}|checksum:${checksum}`;
}

export function shouldReplaceOfflinePublicationAsset(input: {
  currentChecksum?: string | null;
  nextChecksum?: string | null;
}): boolean {
  const currentChecksum = normalizePublicationChecksum(input.currentChecksum);
  const nextChecksum = normalizePublicationChecksum(input.nextChecksum);
  return Boolean(currentChecksum && nextChecksum && currentChecksum !== nextChecksum);
}

export function normalizePublicationChecksum(checksum: string | null | undefined): string | null {
  const value = checksum?.trim();
  return value && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null;
}

export function normalizePublicationFormat(format: string | null | undefined): string | null {
  const value = format?.trim().toLowerCase();
  return value || null;
}

function getFileSizeMismatch(
  expectedSize: number | null | undefined,
  byteLength: number | null | undefined,
): boolean | null {
  if (!Number.isFinite(expectedSize) || !Number.isFinite(byteLength)) return null;
  return expectedSize !== byteLength;
}
