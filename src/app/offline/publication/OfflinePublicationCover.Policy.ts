import type { OfflinePublicationCoverRecord } from "../storage/OfflineRepositories.Types";

const SUPPORTED_COVER_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function normalizeOfflinePublicationCoverContentType(
  value: string | null | undefined,
): string | null {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return SUPPORTED_COVER_TYPES.has(normalized) ? normalized : null;
}

export function isUsableOfflinePublicationCover(
  record: OfflinePublicationCoverRecord<Blob> | null | undefined,
): record is OfflinePublicationCoverRecord<Blob> {
  return record?.payload instanceof Blob
    && record.payload.size > 0
    && record.payload.size === record.byteLength
    && normalizeOfflinePublicationCoverContentType(record.contentType) !== null;
}
