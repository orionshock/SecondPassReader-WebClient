import type {
  OfflineProjectionRecord,
  OfflineProjectionRepository,
} from "../storage/OfflineRepositories.Types";

const namespaceGenerations = new Map<string, number>();
const namespaceQueues = new Map<string, Promise<void>>();

export type OfflineProjectionPublicationLease = {
  namespaceKey: string;
  isCurrent(): boolean;
};

export function createOfflineProjectionPublicationLease(
  namespaceKey: string,
  ownsPublication: () => boolean,
): OfflineProjectionPublicationLease | null {
  const normalized = namespaceKey.trim();
  if (!normalized) return null;
  const generation = namespaceGenerations.get(normalized) ?? 0;
  return {
    namespaceKey: normalized,
    isCurrent: () => ownsPublication() && (namespaceGenerations.get(normalized) ?? 0) === generation,
  };
}

// Projection work may outlive the namespace or request that started it. Serialize publication
// with cleanup and undo a commit that lost ownership while IndexedDB was completing it.
export function publishOfflineProjection<T>(input: {
  lease: OfflineProjectionPublicationLease;
  repository: OfflineProjectionRepository;
  record: OfflineProjectionRecord<T>;
}): Promise<boolean> {
  const { lease, repository, record } = input;
  if (record.namespaceKey !== lease.namespaceKey) return Promise.resolve(false);
  return serializeNamespaceOperation(lease.namespaceKey, async () => {
    if (!lease.isCurrent()) return false;
    const previous = await repository.get<T>(record.namespaceKey, record.projectionKey);
    if (!lease.isCurrent()) return false;
    await repository.put(record);
    if (lease.isCurrent()) return true;

    if (previous) await repository.put(previous);
    else await repository.delete(record.namespaceKey, record.projectionKey);
    return false;
  });
}

export function cleanupOfflineProjectionNamespace<T>(
  namespaceKey: string,
  cleanup: () => Promise<T>,
): Promise<T> {
  const normalized = namespaceKey.trim();
  // Invalidate synchronously, then order cleanup after any write already committing for this namespace.
  namespaceGenerations.set(normalized, (namespaceGenerations.get(normalized) ?? 0) + 1);
  return serializeNamespaceOperation(normalized, cleanup);
}

async function serializeNamespaceOperation<T>(namespaceKey: string, operation: () => Promise<T>): Promise<T> {
  const previous = namespaceQueues.get(namespaceKey) ?? Promise.resolve();
  let release!: () => void;
  const turn = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.catch(() => undefined).then(() => turn);
  namespaceQueues.set(namespaceKey, queued);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (namespaceQueues.get(namespaceKey) === queued) namespaceQueues.delete(namespaceKey);
  }
}
