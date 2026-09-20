import type { BookDetail } from "@secondpass/client";
import { getReaderReturnTarget } from "../../../../features/reader/ReaderReturnTarget.Store";
import type { OfflineOpenedBook, ReaderReturnTarget } from "../../../../features/reader/Reader.Types";
import type { OfflineCacheNamespace } from "../../namespace/OfflineCacheNamespace.Policy";
import type { OfflineClock } from "../../OfflineClock.Types";
import {
  publishOfflineProjection,
  type OfflineNamespacePublicationLease,
} from "../../namespace/OfflineNamespacePublication.Lifecycle";
import { loadOrCreateOfflineReaderContinuity } from "./OfflineReaderContinuity.Controller";
import {
  classifyOfflinePublicationAssetAvailability,
  normalizePublicationChecksum,
  normalizePublicationFormat,
} from "../../publication/OfflinePublicationAsset.Policy";
import type {
  OfflineProjectionRepository,
  OfflinePublicationAssetRepository,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "../../storage/OfflineRepositories.Types";

const OFFLINE_READER_FORMAT = "epub";
const BOOK_DETAIL_PROJECTION_SCHEMA_VERSION = 1;

export type OfflineReaderOpenResult =
  | { status: "opened"; openedBook: OfflineOpenedBook }
  | {
      status: "unavailable";
      reason: "unsupported-format" | "missing-asset" | "invalid-asset";
    }
  | { status: "failed" };

export function offlineReaderBookProjectionKey(bookId: string | number): string {
  return `reader-book:${String(bookId).trim()}`;
}

export async function retainOfflineReaderBookMetadata(input: {
  book: BookDetail;
  repository: OfflineProjectionRepository;
  publication: OfflineNamespacePublicationLease;
  clock?: OfflineClock;
}): Promise<boolean> {
  return publishOfflineProjection({
    lease: input.publication,
    repository: input.repository,
    record: {
      namespaceKey: input.publication.namespaceKey,
      projectionKey: offlineReaderBookProjectionKey(input.book.id),
      value: input.book,
      fetchedAt: input.clock?.now() ?? Date.now(),
      schemaVersion: BOOK_DETAIL_PROJECTION_SCHEMA_VERSION,
    },
  });
}

export async function loadOfflineReaderBookMetadata(input: {
  namespaceKey: string;
  bookId: string;
  repository: OfflineProjectionRepository;
}): Promise<BookDetail | null> {
  const record = await input.repository.get<BookDetail>(
    input.namespaceKey,
    offlineReaderBookProjectionKey(input.bookId),
  );
  const book = record?.value;
  return book && String(book.id) === input.bookId ? book : null;
}

export async function openOfflineBookForReader(input: {
  namespace: OfflineCacheNamespace;
  book: BookDetail;
  assetRepository: OfflinePublicationAssetRepository<Blob>;
  readerStateRepository: OfflineReaderStateRepository;
  outboxRepository: ReaderOutboxRepository;
  returnTarget?: ReaderReturnTarget | null;
  createObjectUrl?: (blob: Blob) => string;
}): Promise<OfflineReaderOpenResult> {
  const namespaceKey = input.namespace.key.trim();
  const bookId = String(input.book.id).trim();
  const format = normalizePublicationFormat(input.book.file?.format);
  const checksum = normalizePublicationChecksum(input.book.file?.checksum);
  if (!namespaceKey || !bookId || format !== OFFLINE_READER_FORMAT) {
    return { status: "unavailable", reason: "unsupported-format" };
  }
  if (!checksum) return { status: "unavailable", reason: "invalid-asset" };

  try {
    const asset = await input.assetRepository.get(namespaceKey, bookId, format);
    if (!asset) return { status: "unavailable", reason: "missing-asset" };
    const availability = classifyOfflinePublicationAssetAvailability({
      fileMetadata: input.book.file,
      assetRecord: asset,
    });
    if (
      availability.status !== "available" ||
      !(asset.payload instanceof Blob) ||
      asset.payload.size !== asset.byteLength
    ) {
      return { status: "unavailable", reason: "invalid-asset" };
    }

    const continuity = await loadOrCreateOfflineReaderContinuity({
      namespaceKey,
      bookId,
      stateRepository: input.readerStateRepository,
      outboxRepository: input.outboxRepository,
    });
    const objectUrl = (input.createObjectUrl ?? URL.createObjectURL)(asset.payload);
    return {
      status: "opened",
      openedBook: {
        source: "offline",
        book: input.book,
        blob: asset.payload,
        objectUrl,
        openedAt: new Date().toISOString(),
        bootstrap: {
          kind: "local",
          continuity: continuity.state,
          serverWritesAllowed: false,
        },
        returnTarget: input.returnTarget ?? getReaderReturnTarget(bookId),
      },
    };
  } catch {
    return { status: "failed" };
  }
}
