import { openIndexedDbOfflineRepositories } from "../storage/IndexedDbOfflineRepositories.Factory";
import type { IndexedDbOfflineRepositories } from "../storage/IndexedDbOfflineRepositories.Factory";
import type { OfflineNamespaceRetentionSummary } from "./OfflineNamespaceRetention.Presenter";
import { summarizeOfflineNamespaceRetention } from "./OfflineNamespaceRetention.Presenter";
import { debugWarn } from "../../../lib/debug/DebugLogger.Diagnostics";

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
  let repositories: NamespaceRepositories | null = null;
  try {
    repositories = await openRepositories();
    await repositories.projections.deleteNamespace(namespaceKey);
    await repositories.publicationAssets.deleteNamespace(namespaceKey);
    await repositories.readerState.deleteNamespace(namespaceKey);
    await repositories.readerOutbox.deleteNamespace(namespaceKey);
    return { status: "removed" };
  } catch (error) {
    debugWarn("reader", "offline namespace cleanup failed", { error });
    return { status: "failed" };
  } finally {
    repositories?.close();
  }
}
