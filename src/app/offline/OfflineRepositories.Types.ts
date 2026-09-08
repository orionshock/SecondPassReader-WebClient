import type {
  MarginaliaBookmarkUpsert,
  MarginaliaHighlightUpsert,
} from "@secondpass/client";
import type {
  ReaderAnnotationOrigin,
  ReaderOutboxIntent,
  ReplaceReaderProgressIntent,
} from "./ReaderOutbox.Policy";

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

export type OfflineEpubAssetCompleteRecord<TPayload> = {
  status: "complete";
  namespaceKey: string;
  bookId: string;
  checksum: string;
  byteLength: number;
  schemaVersion: number;
  payload: TPayload;
};

// TPayload remains storage-neutral but must be suitable for detached repository reads and writes.
export interface OfflineEpubAssetRepository<TPayload> {
  get(namespaceKey: string, bookId: string): Promise<OfflineEpubAssetCompleteRecord<TPayload> | null>;
  putComplete(record: OfflineEpubAssetCompleteRecord<TPayload>): Promise<void>;
  delete(namespaceKey: string, bookId: string): Promise<void>;
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
  localSessionId: string;
  serverSessionId: string | null;
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
  deleteNamespace(namespaceKey: string): Promise<void>;
}
