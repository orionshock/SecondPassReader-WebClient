const namespaceGenerations = new Map<string, number>();
const namespaceQueues = new Map<string, Promise<void>>();

export type OfflineHomeProjectionPublicationLease = {
  namespaceKey: string;
  isCurrent(): boolean;
};

export function createOfflineHomeProjectionPublicationLease(
  namespaceKey: string,
  ownsPreview: () => boolean,
): OfflineHomeProjectionPublicationLease | null {
  const normalized = namespaceKey.trim();
  if (!normalized) return null;
  const generation = namespaceGenerations.get(normalized) ?? 0;
  return {
    namespaceKey: normalized,
    isCurrent: () => ownsPreview() && (namespaceGenerations.get(normalized) ?? 0) === generation,
  };
}

export function publishOfflineHomeProjection(
  lease: OfflineHomeProjectionPublicationLease,
  publish: () => Promise<void>,
): Promise<void> {
  return serializeNamespaceOperation(lease.namespaceKey, async () => {
    if (lease.isCurrent()) await publish();
  });
}

export function cleanupOfflineHomeProjectionNamespace<T>(
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
