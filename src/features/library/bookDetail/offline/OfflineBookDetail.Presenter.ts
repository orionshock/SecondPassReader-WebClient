import type { BookDetail } from "@secondpass/client";
import {
  normalizePublicationFormat,
} from "../../../../app/offline/publication/OfflinePublicationAsset.Policy";
import {
  buildOfflineSavedPublications,
  offlineSavedBookTitle,
  selectOfflineSavedPublication,
} from "../../../../app/offline/publication/OfflineSavedPublication.Queries";
import type {
  OfflinePublicationAssetCompleteRecord,
  OfflinePublicationCoverRecord,
} from "../../../../app/offline/storage/OfflineRepositories.Types";

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
  coverBlob: Blob | null;
  availability: "available" | "needs-attention" | "unsupported-format" | "not-available" | "unknown";
  canOpenReader: boolean;
};

export function presentOfflineBookDetail(input: {
  bookId: string;
  book: BookDetail | null;
  assets: OfflinePublicationAssetCompleteRecord<Blob>[];
  cover?: OfflinePublicationCoverRecord<Blob> | null;
  assetReadFailed?: boolean;
}): OfflineBookDetail {
  const bookId = input.bookId.trim();
  const expectedFormat = normalizePublicationFormat(input.book?.file?.format);
  const metadata = new Map([[bookId, input.book]]);
  const covers = new Map([[bookId, input.cover ?? null]]);
  const saved = selectOfflineSavedPublication(
    buildOfflineSavedPublications({ assets: input.assets, metadata, covers }),
    bookId,
    expectedFormat,
  );
  const availability = input.assetReadFailed && !saved
    ? "unknown"
    : !saved
      ? "not-available"
      : saved.admission === "unsupported-format"
        ? "unsupported-format"
        : saved.admission === "available"
          ? "available"
          : "needs-attention";
  const title = offlineSavedBookTitle(bookId, input.book?.title ?? null);

  return {
    bookId,
    book: input.book,
    title: title.text,
    titleAvailable: title.available,
    subtitle: input.book?.subtitle?.trim() || null,
    authors: input.book?.authors?.map((author) => author.name.trim()).filter(Boolean).join(", ") || null,
    series: formatSeries(input.book),
    description: input.book?.description?.trim() || null,
    publisher: input.book?.publisher?.trim() || null,
    language: input.book?.language?.trim() || null,
    format: saved?.format ?? expectedFormat,
    assetBytes: saved?.assetBytes ?? null,
    asset: saved?.asset ?? null,
    coverBlob: saved?.coverBlob ?? null,
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

function formatSeries(book: BookDetail | null): string | null {
  const series = book?.series;
  const name = series?.name?.trim();
  if (!series || !name) return null;
  return series.seriesIndex === null || series.seriesIndex === undefined
    ? name
    : `${name} #${series.seriesIndex}`;
}
