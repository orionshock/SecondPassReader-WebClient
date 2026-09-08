import type {
  OfflineEpubAssetCompleteRecord,
  OfflineEpubAssetRepository,
  OfflineProjectionRecord,
  OfflineProjectionRepository,
  OfflineReaderBookState,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "../app/offline/OfflineRepositories.Types";
import {
  coalesceReaderIntent,
  readerIntentResourceKey,
  type ReaderOutboxIntent,
} from "../app/offline/ReaderOutbox.Policy";

export type OfflineRepositoryTestFactories = {
  createProjectionRepository(): OfflineProjectionRepository;
  createEpubAssetRepository(): OfflineEpubAssetRepository<Uint8Array>;
  createReaderStateRepository(): OfflineReaderStateRepository;
  createReaderOutboxRepository(): ReaderOutboxRepository;
};

export function createInMemoryOfflineRepositoryFactories(): OfflineRepositoryTestFactories {
  return {
    createProjectionRepository: () => new InMemoryOfflineProjectionRepository(),
    createEpubAssetRepository: () => new InMemoryOfflineEpubAssetRepository(),
    createReaderStateRepository: () => new InMemoryOfflineReaderStateRepository(),
    createReaderOutboxRepository: () => new InMemoryReaderOutboxRepository(),
  };
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

class InMemoryOfflineEpubAssetRepository implements OfflineEpubAssetRepository<Uint8Array> {
  private readonly records = new Map<string, OfflineEpubAssetCompleteRecord<Uint8Array>>();

  async get(namespaceKey: string, bookId: string): Promise<OfflineEpubAssetCompleteRecord<Uint8Array> | null> {
    const record = this.records.get(scopedKey(namespaceKey, bookId));
    return record ? clone(record) : null;
  }

  async putComplete(record: OfflineEpubAssetCompleteRecord<Uint8Array>): Promise<void> {
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

class InMemoryOfflineReaderStateRepository implements OfflineReaderStateRepository {
  private readonly records = new Map<string, OfflineReaderBookState>();

  async getBookState(namespaceKey: string, bookId: string): Promise<OfflineReaderBookState | null> {
    const record = this.records.get(scopedKey(namespaceKey, bookId));
    return record ? clone(record) : null;
  }

  async putBookState(state: OfflineReaderBookState): Promise<void> {
    this.records.set(scopedKey(state.namespaceKey, state.bookId), clone(state));
  }

  async deleteBookState(namespaceKey: string, bookId: string): Promise<void> {
    this.records.delete(scopedKey(namespaceKey, bookId));
  }

  async deleteNamespace(namespaceKey: string): Promise<void> {
    for (const [key, record] of this.records) {
      if (record.namespaceKey === namespaceKey) this.records.delete(key);
    }
  }
}

class InMemoryReaderOutboxRepository implements ReaderOutboxRepository {
  private intents: ReaderOutboxIntent[] = [];

  async list(namespaceKey: string): Promise<ReaderOutboxIntent[]> {
    return clone(this.intents.filter((intent) => intent.namespaceKey === namespaceKey));
  }

  async upsertIntent(intent: ReaderOutboxIntent): Promise<void> {
    this.intents = clone(coalesceReaderIntent(this.intents, clone(intent)));
  }

  async remove(namespaceKey: string, resourceKey: string, expectedRevision: number | null): Promise<boolean> {
    const index = this.intents.findIndex(
      (intent) => intent.namespaceKey === namespaceKey
        && readerIntentResourceKey(intent) === resourceKey,
    );
    if (index < 0) return false;

    const intent = this.intents[index];
    const currentRevision = "intentRevision" in intent ? intent.intentRevision : null;
    if (currentRevision !== expectedRevision) return false;

    this.intents.splice(index, 1);
    return true;
  }

  async deleteNamespace(namespaceKey: string): Promise<void> {
    this.intents = this.intents.filter((intent) => intent.namespaceKey !== namespaceKey);
  }
}

function scopedKey(namespaceKey: string, resourceKey: string): string {
  return JSON.stringify([namespaceKey, resourceKey]);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
