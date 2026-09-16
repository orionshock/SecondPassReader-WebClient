import type { OfflinePublicationAssetCompleteRecord } from "../../offline/storage/OfflineRepositories.Types";
import type { ReaderOutboxIntent } from "../../offline/reader/outbox/ReaderOutbox.Policy";
import {
  offlineReaderRetryEligibility,
  type OfflineReaderRetryEligibility,
} from "../../offline/reader/retry/OfflineReaderRetryEligibility.Policy";

export type OfflineSettingsPendingSummary = {
  books: number;
  intents: number;
  sessionEstablishment: number;
  progress: number;
  annotations: number;
  attentionBooks: number;
  deferredBooks: number;
};

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

export type OfflinePendingWorkPresentation = {
  summary: OfflineSettingsPendingSummary;
  books: OfflinePendingBook[];
};

type ClassifiedIntent = {
  intent: ReaderOutboxIntent;
  eligibility: OfflineReaderRetryEligibility;
};

// Summary totals and Book rows share this classified snapshot so a retry-time transition cannot
// classify the same durable intent differently within one Settings render.
export function buildOfflinePendingWorkPresentation(input: {
  intents: readonly ReaderOutboxIntent[];
  titles: ReadonlyMap<string, string | null>;
  assets: readonly OfflinePublicationAssetCompleteRecord<Blob>[];
  now: number;
}): OfflinePendingWorkPresentation {
  const grouped = new Map<string, ClassifiedIntent[]>();
  for (const intent of input.intents) {
    const classified = {
      intent,
      eligibility: offlineReaderRetryEligibility({ intent, mode: "automatic", now: input.now }),
    };
    const current = grouped.get(intent.bookId) ?? [];
    current.push(classified);
    grouped.set(intent.bookId, current);
  }

  const assetsByBook = new Map<string, OfflinePublicationAssetCompleteRecord<Blob>[]>();
  for (const asset of input.assets) {
    const current = assetsByBook.get(asset.bookId) ?? [];
    current.push(asset);
    assetsByBook.set(asset.bookId, current);
  }

  const books = [...grouped].map(([bookId, classified]) => presentBook(
    bookId,
    classified,
    input.titles.get(bookId) ?? null,
    assetsByBook.get(bookId) ?? [],
  )).sort(compareBooks);

  return {
    summary: summarize(input.intents, grouped),
    books,
  };
}

function summarize(
  intents: readonly ReaderOutboxIntent[],
  grouped: ReadonlyMap<string, readonly ClassifiedIntent[]>,
): OfflineSettingsPendingSummary {
  const classifications = [...grouped.values()].map((values) => values.map((value) => value.eligibility));
  return {
    books: grouped.size,
    intents: intents.length,
    sessionEstablishment: intents.filter((intent) => intent.type === "establish-session").length,
    progress: intents.filter((intent) => intent.type === "replace-progress").length,
    annotations: intents.filter((intent) => intent.type === "upsert-annotation" || intent.type === "delete-annotation").length,
    // Summary membership is intentionally independent from the single precedence label shown on a Book row.
    attentionBooks: classifications.filter((values) => values.includes("manual-only")).length,
    deferredBooks: classifications.filter((values) => values.includes("deferred") && !values.includes("manual-only")).length,
  };
}

function presentBook(
  bookId: string,
  classified: readonly ClassifiedIntent[],
  storedTitle: string | null,
  assets: readonly OfflinePublicationAssetCompleteRecord<Blob>[],
): OfflinePendingBook {
  const intents = classified.map((value) => value.intent);
  const title = presentOfflineBookTitle(bookId, storedTitle);
  const categoryStatus = (predicate: (intent: ReaderOutboxIntent) => boolean) => statusFor(
    classified.filter((value) => predicate(value.intent)).map((value) => value.eligibility),
  );
  return {
    bookId,
    title: title.text,
    titleAvailable: title.available,
    pendingIntentCount: intents.length,
    needsSessionEstablishment: intents.some((intent) => intent.type === "establish-session"),
    hasProgress: intents.some((intent) => intent.type === "replace-progress"),
    annotationUpsertCount: intents.filter((intent) => intent.type === "upsert-annotation").length,
    annotationDeleteCount: intents.filter((intent) => intent.type === "delete-annotation").length,
    hasOfflineAsset: assets.length > 0,
    assetFormats: [...new Set(assets.map((asset) => asset.format.toUpperCase()))].sort(),
    assetBytes: assets.reduce((total, asset) => total + asset.byteLength, 0),
    status: statusFor(classified.map((value) => value.eligibility)) ?? "waiting",
    attentionIntentCount: classified.filter((value) => value.eligibility === "manual-only").length,
    deferredIntentCount: classified.filter((value) => value.eligibility === "deferred").length,
    sessionStatus: categoryStatus((intent) => intent.type === "establish-session"),
    progressStatus: categoryStatus((intent) => intent.type === "replace-progress"),
    annotationStatus: categoryStatus((intent) => intent.type === "upsert-annotation" || intent.type === "delete-annotation"),
  };
}

function statusFor(states: readonly OfflineReaderRetryEligibility[]): OfflinePendingBookStatus | null {
  if (states.length === 0) return null;
  if (states.includes("blocked-auth")) return "connection-repair";
  if (states.includes("manual-only")) return "needs-attention";
  if (states.includes("blocked-authority")) return "authority-blocked";
  if (states.includes("deferred")) return "deferred";
  return "waiting";
}

function compareBooks(left: OfflinePendingBook, right: OfflinePendingBook): number {
  return Number(right.titleAvailable) - Number(left.titleAvailable)
    || left.title.localeCompare(right.title)
    || left.bookId.localeCompare(right.bookId);
}

export function presentOfflineBookTitle(bookId: string, storedTitle: string | null): {
  text: string;
  available: boolean;
} {
  const title = storedTitle?.trim();
  return {
    text: title || `Book ${shortBookId(bookId)}`,
    available: Boolean(title),
  };
}

function shortBookId(bookId: string): string {
  return bookId.length <= 12 ? bookId : `${bookId.slice(0, 8)}...`;
}
