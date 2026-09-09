import type {
  MarginaliaBookmarkUpsert,
  MarginaliaHighlightUpsert,
} from "@secondpass/client";
import type {
  ReaderAnnotationOrigin,
  ReaderOutboxIntent,
  ReplaceReaderProgressIntent,
} from "./ReaderOutbox.Policy";
import type { OfflineReaderSession } from "./OfflineReaderSession.Policy";

export type OfflineProjectionRecord<T> = {
  namespaceKey: string;
  projectionKey: string;
  value: T;
  fetchedAt: number;
  schemaVersion: number;
};

// Repository reads and writes must detach values from caller-owned mutable object identity.
export interface OfflineProjectionRepository {
  get<T>(namespaceKey: string, projectionKey: string): Promise<OfflineProjectionRecord<T> | null>;
  put<T>(record: OfflineProjectionRecord<T>): Promise<void>;
  delete(namespaceKey: string, projectionKey: string): Promise<void>;
  deleteNamespace(namespaceKey: string): Promise<void>;
}

export type OfflinePublicationAssetCompleteRecord<TPayload> = {
  status: "complete";
  namespaceKey: string;
  bookId: string;
  format: string;
  checksum: string;
  byteLength: number;
  schemaVersion: number;
  payload: TPayload;
};

// TPayload remains storage-neutral but must be suitable for detached repository reads and writes.
export interface OfflinePublicationAssetRepository<TPayload> {
  get(namespaceKey: string, bookId: string, format: string): Promise<OfflinePublicationAssetCompleteRecord<TPayload> | null>;
  list(namespaceKey: string): Promise<OfflinePublicationAssetCompleteRecord<TPayload>[]>;
  putComplete(record: OfflinePublicationAssetCompleteRecord<TPayload>): Promise<void>;
  delete(namespaceKey: string, bookId: string, format: string): Promise<void>;
  deleteNamespace(namespaceKey: string): Promise<void>;
}

export type OfflineReaderAnnotationProjection =
  | {
      status: "present";
      origin: ReaderAnnotationOrigin;
      annotation: MarginaliaHighlightUpsert | MarginaliaBookmarkUpsert;
    }
  | {
      status: "deleted";
      origin: ReaderAnnotationOrigin;
      clientId: string;
    };

export type OfflineReaderBookState = {
  namespaceKey: string;
  bookId: string;
  schemaVersion: number;
  session: OfflineReaderSession;
  progress: ReplaceReaderProgressIntent["progress"] | null;
  annotations: OfflineReaderAnnotationProjection[];
};

// Reader continuity is local desired state; it is not an authoritative server projection.
export interface OfflineReaderStateRepository {
  getBookState(namespaceKey: string, bookId: string): Promise<OfflineReaderBookState | null>;
  putBookState(state: OfflineReaderBookState): Promise<void>;
  deleteBookState(namespaceKey: string, bookId: string): Promise<void>;
  deleteNamespace(namespaceKey: string): Promise<void>;
}

export interface ReaderOutboxRepository {
  // Ordering is unspecified. Replay must not infer operation order from this array.
  list(namespaceKey: string): Promise<ReaderOutboxIntent[]>;
  // Implementations must coalesce the incoming intent atomically with the current namespace state.
  upsertIntent(intent: ReaderOutboxIntent): Promise<void>;
  // Removal succeeds only when namespace, resource key, and current revision all match.
  remove(namespaceKey: string, resourceKey: string, expectedRevision: number | null): Promise<boolean>;
  // Replacement changes resource identity atomically and only for the exact current revision.
  replace(
    namespaceKey: string,
    resourceKey: string,
    expectedRevision: number | null,
    replacement: ReaderOutboxIntent,
  ): Promise<boolean>;
  deleteNamespace(namespaceKey: string): Promise<void>;
}
