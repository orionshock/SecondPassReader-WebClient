import { openIndexedDbOfflineRepositories } from "../storage/IndexedDbOfflineRepositories.Factory";
import type { IndexedDbOfflineRepositories } from "../storage/IndexedDbOfflineRepositories.Factory";
import type { OfflineNamespaceRetentionSummary } from "./OfflineNamespaceRetention.Presenter";
import { summarizeOfflineNamespaceRetention } from "./OfflineNamespaceRetention.Presenter";
import { debugWarn } from "../../../lib/debug/DebugLogger.Diagnostics";
import { cleanupOfflineNamespacePublication } from "./OfflineNamespacePublication.Lifecycle";

type NamespaceRepositories = IndexedDbOfflineRepositories<Blob>;

export type OfflineNamespaceCleanupResult =
  | { status: "removed" }
  | { status: "failed" };

export async function inspectOfflineNamespace(
  namespaceKey: string,
  openRepositories: () => Promise<NamespaceRepositories> = () => openIndexedDbOfflineRepositories<Blob>(),
): Promise<OfflineNamespaceRetentionSummary | null> {
  let repositories: NamespaceRepositories | null = null;
  try {
    repositories = await openRepositories();
    const [intents, assets] = await Promise.all([
      repositories.readerOutbox.list(namespaceKey),
      repositories.publicationAssets.list(namespaceKey),
    ]);
    return summarizeOfflineNamespaceRetention(intents, assets);
  } catch (error) {
    debugWarn("reader", "offline namespace inspection failed", { error });
    return null;
  } finally {
    repositories?.close();
  }
}

export async function removeOfflineNamespace(
  namespaceKey: string,
  openRepositories: () => Promise<NamespaceRepositories> = () => openIndexedDbOfflineRepositories<Blob>(),
): Promise<OfflineNamespaceCleanupResult> {
  const normalizedNamespaceKey = namespaceKey.trim();
  return cleanupOfflineNamespacePublication(normalizedNamespaceKey, async () => {
    let repositories: NamespaceRepositories | null = null;
    try {
      repositories = await openRepositories();
      await repositories.deleteNamespace(normalizedNamespaceKey);
      return { status: "removed" };
    } catch (error) {
      debugWarn("reader", "offline namespace cleanup failed", { error });
      return { status: "failed" };
    } finally {
      repositories?.close();
    }
  });
}
