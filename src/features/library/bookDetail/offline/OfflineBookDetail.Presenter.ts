import type { BookDetail } from "@secondpass/client";
import {
  classifyOfflinePublicationAssetAvailability,
  normalizePublicationFormat,
} from "../../../../app/offline/publication/OfflinePublicationAsset.Policy";
import type { OfflinePublicationAssetCompleteRecord } from "../../../../app/offline/storage/OfflineRepositories.Types";

const CURRENT_READER_FORMAT = "epub";

export type OfflineBookDetail = {
  bookId: string;
  book: BookDetail | null;
  title: string;
  titleAvailable: boolean;
  subtitle: string | null;
  authors: string | null;
  series: string | null;
  description: string | null;
  publisher: string | null;
  language: string | null;
  format: string | null;
  assetBytes: number | null;
  asset: OfflinePublicationAssetCompleteRecord<Blob> | null;
  availability: "available" | "needs-attention" | "unsupported-format" | "not-available" | "unknown";
  canOpenReader: boolean;
};

export function presentOfflineBookDetail(input: {
  bookId: string;
  book: BookDetail | null;
  assets: OfflinePublicationAssetCompleteRecord<Blob>[];
  assetReadFailed?: boolean;
}): OfflineBookDetail {
  const bookId = input.bookId.trim();
  const expectedFormat = normalizePublicationFormat(input.book?.file?.format);
  const asset = selectAsset(input.assets.filter((candidate) => candidate.bookId === bookId), expectedFormat);
  const assetFormat = normalizePublicationFormat(asset?.format);
  const format = assetFormat ?? expectedFormat;
  const payloadComplete = Boolean(asset?.payload instanceof Blob && asset.payload.size === asset.byteLength);
  const policyAvailability = input.book && asset
    ? classifyOfflinePublicationAssetAvailability({ fileMetadata: input.book.file, assetRecord: asset })
    : null;
  const availability = input.assetReadFailed && !asset
    ? "unknown"
    : !asset
      ? "not-available"
      : assetFormat !== CURRENT_READER_FORMAT
        ? "unsupported-format"
        : policyAvailability?.status === "available" && payloadComplete
          ? "available"
          : "needs-attention";
  const title = input.book?.title?.trim();

  return {
    bookId,
    book: input.book,
    title: title || fallbackBookTitle(bookId),
    titleAvailable: Boolean(title),
    subtitle: input.book?.subtitle?.trim() || null,
    authors: input.book?.authors?.map((author) => author.name.trim()).filter(Boolean).join(", ") || null,
    series: formatSeries(input.book),
    description: input.book?.description?.trim() || null,
    publisher: input.book?.publisher?.trim() || null,
    language: input.book?.language?.trim() || null,
    format,
    assetBytes: asset?.payload.size ?? null,
    asset,
    availability,
    canOpenReader: availability === "available" && Boolean(input.book),
  };
}

export function formatOfflineBookAssetBytes(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes >= 10 ? kilobytes.toFixed(0) : kilobytes.toFixed(1)} KB`;
  const megabytes = kilobytes / 1024;
  if (megabytes < 1024) return `${megabytes >= 10 ? megabytes.toFixed(0) : megabytes.toFixed(1)} MB`;
  return `${(megabytes / 1024).toFixed(1)} GB`;
}

function selectAsset(
  assets: OfflinePublicationAssetCompleteRecord<Blob>[],
  expectedFormat: string | null,
): OfflinePublicationAssetCompleteRecord<Blob> | null {
  const ordered = [...assets].sort((left, right) => left.format.localeCompare(right.format));
  return ordered.find((asset) => normalizePublicationFormat(asset.format) === expectedFormat) ?? ordered[0] ?? null;
}

function formatSeries(book: BookDetail | null): string | null {
  const series = book?.series;
  const name = series?.name?.trim();
  if (!series || !name) return null;
  return series.seriesIndex === null || series.seriesIndex === undefined
    ? name
    : `${name} #${series.seriesIndex}`;
}

function fallbackBookTitle(bookId: string): string {
  const shortId = bookId.length > 12 ? `${bookId.slice(0, 8)}...` : bookId;
  return `Book ${shortId || "unknown"}`;
}
