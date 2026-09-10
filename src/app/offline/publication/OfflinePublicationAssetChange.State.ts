const listeners = new Set<(namespaceKey: string) => void>();

export function publishOfflinePublicationAssetChange(namespaceKey: string): void {
  for (const listener of [...listeners]) {
    try {
      listener(namespaceKey);
    } catch {
      // A lifecycle listener cannot invalidate an already committed repository write.
    }
  }
}

export function subscribeToOfflinePublicationAssetChange(
  listener: (namespaceKey: string) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
