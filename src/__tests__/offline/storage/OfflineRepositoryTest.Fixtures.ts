import { planLocalReaderAnnotationCommit } from "../../../app/offline/reader/annotations/LocalReaderAnnotationCommit.Policy";
import type { LocalReaderAnnotationCommit, LocalReaderAnnotationCommitResult } from "../../../app/offline/reader/annotations/LocalReaderAnnotationCommit.Repository";
import type { LocalReaderAnnotationCommitRepository } from "../../../app/offline/reader/annotations/LocalReaderAnnotationCommit.Repository";
import type {
  OfflinePublicationAssetCompleteRecord,
  OfflinePublicationAssetRepository,
  OfflinePublicationCoverRecord,
  OfflinePublicationCoverRepository,
  OfflineProjectionRecord,
  OfflineProjectionRepository,
  OfflineReaderBookState,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "../../../app/offline/storage/OfflineRepositories.Types";
import {
  coalesceReaderIntent,
  readerIntentRevision,
  readerIntentResourceKey,
  type ReaderOutboxAttempt,
  type ReaderOutboxIntent,
} from "../../../app/offline/reader/outbox/ReaderOutbox.Policy";

export type OfflineRepositoryTestFactories = {
  createProjectionRepository(): OfflineProjectionRepository | Promise<OfflineProjectionRepository>;
  createPublicationAssetRepository(): OfflinePublicationAssetRepository<Uint8Array> | Promise<OfflinePublicationAssetRepository<Uint8Array>>;
  createPublicationCoverRepository(): OfflinePublicationCoverRepository<Uint8Array> | Promise<OfflinePublicationCoverRepository<Uint8Array>>;
  createReaderStateRepository(): OfflineReaderStateRepository | Promise<OfflineReaderStateRepository>;
  createReaderOutboxRepository(): ReaderOutboxRepository | Promise<ReaderOutboxRepository>;
};

export function createInMemoryOfflineRepositoryFactories(): OfflineRepositoryTestFactories {
  return {
    createProjectionRepository: () => new InMemoryOfflineProjectionRepository(),
    createPublicationAssetRepository: () => new InMemoryOfflinePublicationAssetRepository(),
    createPublicationCoverRepository: () => new InMemoryOfflinePublicationCoverRepository(),
    createReaderStateRepository: () => new InMemoryOfflineReaderStateRepository(),
    createReaderOutboxRepository: () => new InMemoryReaderOutboxRepository(),
  };
}

export function createInMemoryReaderRepositories(): {
  stateRepository: OfflineReaderStateRepository;
  outboxRepository: ReaderOutboxRepository;
  annotationCommitRepository: LocalReaderAnnotationCommitRepository;
} {
  const storage = new InMemoryReaderStorage();
  return {
    stateRepository: new InMemoryOfflineReaderStateRepository(storage),
    outboxRepository: new InMemoryReaderOutboxRepository(storage),
    annotationCommitRepository: new InMemoryLocalReaderAnnotationCommitRepository(storage),
  };
}

class InMemoryOfflinePublicationCoverRepository implements OfflinePublicationCoverRepository<Uint8Array> {
  private readonly records = new Map<string, OfflinePublicationCoverRecord<Uint8Array>>();

  async get(namespaceKey: string, bookId: string): Promise<OfflinePublicationCoverRecord<Uint8Array> | null> {
    const record = this.records.get(scopedKey(namespaceKey, bookId));
    return record ? clone(record) : null;
  }

  async put(record: OfflinePublicationCoverRecord<Uint8Array>): Promise<void> {
    this.records.set(scopedKey(record.namespaceKey, record.bookId), clone(record));
  }

  async delete(namespaceKey: string, bookId: string): Promise<void> {
    this.records.delete(scopedKey(namespaceKey, bookId));
  }

  async deleteNamespace(namespaceKey: string): Promise<void> {
    for (const [key, record] of this.records) {
      if (record.namespaceKey === namespaceKey) this.records.delete(key);
    }
  }
}

class InMemoryOfflineProjectionRepository implements OfflineProjectionRepository {
  private readonly records = new Map<string, OfflineProjectionRecord<unknown>>();

  async get<T>(namespaceKey: string, projectionKey: string): Promise<OfflineProjectionRecord<T> | null> {
    const record = this.records.get(scopedKey(namespaceKey, projectionKey));
    return record ? clone(record) as OfflineProjectionRecord<T> : null;
  }

  async put<T>(record: OfflineProjectionRecord<T>): Promise<void> {
    this.records.set(scopedKey(record.namespaceKey, record.projectionKey), clone(record));
  }

  async delete(namespaceKey: string, projectionKey: string): Promise<void> {
    this.records.delete(scopedKey(namespaceKey, projectionKey));
  }

  async deleteNamespace(namespaceKey: string): Promise<void> {
    for (const [key, record] of this.records) {
      if (record.namespaceKey === namespaceKey) this.records.delete(key);
    }
  }
}

class InMemoryOfflinePublicationAssetRepository implements OfflinePublicationAssetRepository<Uint8Array> {
  private readonly records = new Map<string, OfflinePublicationAssetCompleteRecord<Uint8Array>>();

  async get(namespaceKey: string, bookId: string, format: string): Promise<OfflinePublicationAssetCompleteRecord<Uint8Array> | null> {
    const record = this.records.get(assetKey(namespaceKey, bookId, format));
    return record ? clone(record) : null;
  }

  async putComplete(record: OfflinePublicationAssetCompleteRecord<Uint8Array>): Promise<void> {
    this.records.set(assetKey(record.namespaceKey, record.bookId, record.format), clone(record));
  }

  async list(namespaceKey: string): Promise<OfflinePublicationAssetCompleteRecord<Uint8Array>[]> {
    return clone([...this.records.values()].filter((record) => record.namespaceKey === namespaceKey));
  }

  async delete(namespaceKey: string, bookId: string, format: string): Promise<void> {
    this.records.delete(assetKey(namespaceKey, bookId, format));
  }

  async deleteNamespace(namespaceKey: string): Promise<void> {
    for (const [key, record] of this.records) {
      if (record.namespaceKey === namespaceKey) this.records.delete(key);
    }
  }
}

class InMemoryOfflineReaderStateRepository implements OfflineReaderStateRepository {
  constructor(private readonly storage = new InMemoryReaderStorage()) {}

  async getBookState(namespaceKey: string, bookId: string): Promise<OfflineReaderBookState | null> {
    const record = this.storage.states.get(scopedKey(namespaceKey, bookId));
    return record ? clone(record) : null;
  }

  async putBookState(state: OfflineReaderBookState): Promise<void> {
    this.storage.states.set(scopedKey(state.namespaceKey, state.bookId), clone(state));
  }

  async updateBookState(
    namespaceKey: string,
    bookId: string,
    mutation: (current: OfflineReaderBookState) => OfflineReaderBookState,
  ) {
    const key = scopedKey(namespaceKey, bookId);
    const current = this.storage.states.get(key);
    if (!current) return { status: "missing" } as const;
    const next = mutation(clone(current));
    if (next.namespaceKey !== namespaceKey || next.bookId !== bookId) {
      throw new Error("Reader state mutation cannot change record identity.");
    }
    const state = clone(next);
    this.storage.states.set(key, state);
    return { status: "committed", state: clone(state) } as const;
  }

  async deleteBookState(namespaceKey: string, bookId: string): Promise<void> {
    this.storage.states.delete(scopedKey(namespaceKey, bookId));
  }

  async deleteNamespace(namespaceKey: string): Promise<void> {
    for (const [key, record] of this.storage.states) {
      if (record.namespaceKey === namespaceKey) this.storage.states.delete(key);
    }
  }
}

class InMemoryReaderOutboxRepository implements ReaderOutboxRepository {
  constructor(private readonly storage = new InMemoryReaderStorage()) {}

  async list(namespaceKey: string): Promise<ReaderOutboxIntent[]> {
    return clone(this.storage.intents.filter((intent) => intent.namespaceKey === namespaceKey));
  }

  async upsertIntent(intent: ReaderOutboxIntent): Promise<void> {
    this.storage.intents = clone(coalesceReaderIntent(this.storage.intents, clone(intent)));
  }

  async remove(namespaceKey: string, resourceKey: string, expectedRevision: number | null): Promise<boolean> {
    const index = this.storage.intents.findIndex(
      (intent) => intent.namespaceKey === namespaceKey
        && readerIntentResourceKey(intent) === resourceKey,
    );
    if (index < 0) return false;

    const intent = this.storage.intents[index];
    const currentRevision = readerIntentRevision(intent);
    if (currentRevision !== expectedRevision) return false;

    this.storage.intents.splice(index, 1);
    return true;
  }

  async replace(
    namespaceKey: string,
    resourceKey: string,
    expectedRevision: number | null,
    replacement: ReaderOutboxIntent,
  ): Promise<boolean> {
    const index = this.storage.intents.findIndex(
      (intent) => intent.namespaceKey === namespaceKey
        && readerIntentResourceKey(intent) === resourceKey,
    );
    if (index < 0 || replacement.namespaceKey !== namespaceKey) return false;
    const current = this.storage.intents[index];
    const currentRevision = readerIntentRevision(current);
    if (currentRevision !== expectedRevision) return false;
    this.storage.intents.splice(index, 1);
    this.storage.intents = clone(coalesceReaderIntent(this.storage.intents, clone(replacement)));
    return true;
  }

  async recordAttempt(
    namespaceKey: string,
    resourceKey: string,
    expectedRevision: number | null,
    attempt: ReaderOutboxAttempt,
  ): Promise<boolean> {
    if (attempt.revision !== expectedRevision) return false;
    const index = this.storage.intents.findIndex((intent) => (
      intent.namespaceKey === namespaceKey && readerIntentResourceKey(intent) === resourceKey
    ));
    if (index < 0 || readerIntentRevision(this.storage.intents[index]) !== expectedRevision) return false;
    this.storage.intents[index] = clone({ ...this.storage.intents[index], attempt });
    return true;
  }

  async deleteNamespace(namespaceKey: string): Promise<void> {
    this.storage.intents = this.storage.intents.filter((intent) => intent.namespaceKey !== namespaceKey);
  }
}

class InMemoryLocalReaderAnnotationCommitRepository implements LocalReaderAnnotationCommitRepository {
  constructor(private readonly storage: InMemoryReaderStorage) {}

  async commit(input: LocalReaderAnnotationCommit): Promise<LocalReaderAnnotationCommitResult> {
    const stateKey = scopedKey(input.namespaceKey, input.bookId);
    const plan = planLocalReaderAnnotationCommit(this.storage.states.get(stateKey), this.storage.intents, input);
    if (plan.status !== "committed") return plan;
    const detached = clone(plan);
    this.storage.states.set(stateKey, detached.state);
    this.storage.intents = detached.intents;
    return { status: "committed", state: clone(detached.state) };
  }
}

class InMemoryReaderStorage {
  readonly states = new Map<string, OfflineReaderBookState>();
  intents: ReaderOutboxIntent[] = [];
}

function scopedKey(namespaceKey: string, resourceKey: string): string {
  return JSON.stringify([namespaceKey, resourceKey]);
}

function assetKey(namespaceKey: string, bookId: string, format: string): string {
  return JSON.stringify([namespaceKey, bookId, format]);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
