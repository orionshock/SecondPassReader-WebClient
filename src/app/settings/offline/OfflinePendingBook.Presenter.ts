import type { OfflinePublicationAssetCompleteRecord } from "../../offline/storage/OfflineRepositories.Types";
import type { ReaderOutboxIntent } from "../../offline/reader/outbox/ReaderOutbox.Policy";
import { offlineReaderRetryEligibility } from "../../offline/reader/retry/OfflineReaderRetryEligibility.Policy";

export type OfflinePendingBookStatus = "waiting" | "deferred" | "needs-attention" | "connection-repair" | "authority-blocked";

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
  status: OfflinePendingBookStatus;
  attentionIntentCount: number;
  deferredIntentCount: number;
  sessionStatus: OfflinePendingBookStatus | null;
  progressStatus: OfflinePendingBookStatus | null;
  annotationStatus: OfflinePendingBookStatus | null;
};

export function presentOfflinePendingBooks(input: {
  intents: readonly ReaderOutboxIntent[];
  titles: ReadonlyMap<string, string | null>;
  assets: readonly OfflinePublicationAssetCompleteRecord<Blob>[];
  now?: number;
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
    const states = intents.map((intent) => offlineReaderRetryEligibility({
      intent,
      mode: "automatic",
      now: input.now ?? Date.now(),
    }));
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
      status: bookStatus(states),
      attentionIntentCount: states.filter((value) => value === "manual-only").length,
      deferredIntentCount: states.filter((value) => value === "deferred").length,
      sessionStatus: categoryStatus(intents.filter((intent) => intent.type === "establish-session"), input.now),
      progressStatus: categoryStatus(intents.filter((intent) => intent.type === "replace-progress"), input.now),
      annotationStatus: categoryStatus(intents.filter((intent) => (
        intent.type === "upsert-annotation" || intent.type === "delete-annotation"
      )), input.now),
    };
  });

  return books.sort((left, right) => (
    Number(right.titleAvailable) - Number(left.titleAvailable)
    || left.title.localeCompare(right.title)
    || left.bookId.localeCompare(right.bookId)
  ));
}

function categoryStatus(intents: ReaderOutboxIntent[], now = Date.now()): OfflinePendingBookStatus | null {
  if (intents.length === 0) return null;
  return bookStatus(intents.map((intent) => offlineReaderRetryEligibility({ intent, mode: "automatic", now })));
}

function bookStatus(states: ReturnType<typeof offlineReaderRetryEligibility>[]): OfflinePendingBookStatus {
  if (states.includes("blocked-auth")) return "connection-repair";
  if (states.includes("manual-only")) return "needs-attention";
  if (states.includes("blocked-authority")) return "authority-blocked";
  if (states.includes("deferred")) return "deferred";
  return "waiting";
}

export function shortOfflineBookId(bookId: string): string {
  return shortBookId(bookId);
}

function shortBookId(bookId: string): string {
  return bookId.length <= 12 ? bookId : `${bookId.slice(0, 8)}...`;
}
