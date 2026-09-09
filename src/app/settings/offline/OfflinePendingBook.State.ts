import type { OfflinePublicationAssetCompleteRecord } from "../../offline/OfflineRepositories.Types";
import type { ReaderOutboxIntent } from "../../offline/ReaderOutbox.Policy";

export type OfflinePendingBook = {
  bookId: string;
  title: string;
  titleAvailable: boolean;
  pendingIntentCount: number;
  needsSessionEstablishment: boolean;
  hasProgress: boolean;
  annotationUpsertCount: number;
  annotationDeleteCount: number;
  hasOfflineAsset: boolean;
  assetFormats: string[];
  assetBytes: number;
};

export function presentOfflinePendingBooks(input: {
  intents: readonly ReaderOutboxIntent[];
  titles: ReadonlyMap<string, string | null>;
  assets: readonly OfflinePublicationAssetCompleteRecord<Blob>[];
}): OfflinePendingBook[] {
  const grouped = new Map<string, ReaderOutboxIntent[]>();
  for (const intent of input.intents) {
    const current = grouped.get(intent.bookId) ?? [];
    current.push(intent);
    grouped.set(intent.bookId, current);
  }

  const books = [...grouped].map(([bookId, intents]) => {
    const title = input.titles.get(bookId)?.trim();
    const assets = input.assets.filter((asset) => asset.bookId === bookId);
    return {
      bookId,
      title: title || `Book ${shortBookId(bookId)}`,
      titleAvailable: Boolean(title),
      pendingIntentCount: intents.length,
      needsSessionEstablishment: intents.some((intent) => intent.type === "establish-session"),
      hasProgress: intents.some((intent) => intent.type === "replace-progress"),
      annotationUpsertCount: intents.filter((intent) => intent.type === "upsert-annotation").length,
      annotationDeleteCount: intents.filter((intent) => intent.type === "delete-annotation").length,
      hasOfflineAsset: assets.length > 0,
      assetFormats: [...new Set(assets.map((asset) => asset.format.toUpperCase()))].sort(),
      assetBytes: assets.reduce((total, asset) => total + asset.byteLength, 0),
    };
  });

  return books.sort((left, right) => (
    Number(right.titleAvailable) - Number(left.titleAvailable)
    || left.title.localeCompare(right.title)
    || left.bookId.localeCompare(right.bookId)
  ));
}

export function shortOfflineBookId(bookId: string): string {
  return shortBookId(bookId);
}

function shortBookId(bookId: string): string {
  return bookId.length <= 12 ? bookId : `${bookId.slice(0, 8)}...`;
}
