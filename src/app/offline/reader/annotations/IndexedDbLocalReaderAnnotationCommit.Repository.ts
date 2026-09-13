import type { LocalReaderAnnotationCommitRepository } from "./LocalReaderAnnotationCommit.Repository";
import { OFFLINE_STORE_NAMES, requestResult, runTransaction } from "../../storage/IndexedDbOfflineDatabase.Adapter";
import type { OfflineReaderBookState } from "../../storage/OfflineRepositories.Types";
import { readerIntentResourceKey } from "../outbox/ReaderOutbox.Policy";
import type { StoredReaderOutboxIntent } from "../outbox/IndexedDbReaderOutbox.Repository";
import { publishOfflineReaderOutboxChange } from "../outbox/OfflineReaderOutboxChange.State";
import { planLocalReaderAnnotationCommit } from "./LocalReaderAnnotationCommit.Policy";
import type { LocalReaderAnnotationCommit, LocalReaderAnnotationCommitResult } from "./LocalReaderAnnotationCommit.Repository";

export class IndexedDbLocalReaderAnnotationCommitRepository implements LocalReaderAnnotationCommitRepository {
  constructor(private readonly database: IDBDatabase) {}

  async commit(input: LocalReaderAnnotationCommit): Promise<LocalReaderAnnotationCommitResult> {
    // Projection and delivery intent must commit together: either one alone is not recoverable after process loss.
    const transaction = this.database.transaction([OFFLINE_STORE_NAMES.readerState, OFFLINE_STORE_NAMES.readerOutbox], "readwrite");
    const result = await runTransaction(transaction, async () => {
      const stateStore = transaction.objectStore(OFFLINE_STORE_NAMES.readerState);
      const outboxStore = transaction.objectStore(OFFLINE_STORE_NAMES.readerOutbox);
      const state = await requestResult<OfflineReaderBookState | undefined>(stateStore.get([input.namespaceKey, input.bookId]));
      const records = await requestResult<StoredReaderOutboxIntent[]>(outboxStore.index("namespaceKey").getAll(input.namespaceKey));
      const relevant = records.filter((record) => record.intent.bookId === input.bookId
        && (record.intent.type === "upsert-annotation" || record.intent.type === "delete-annotation"));
      const plan = planLocalReaderAnnotationCommit(state, relevant.map((record) => record.intent), input);
      if (plan.status !== "committed") return plan;
      if (plan.state === state) return { status: "committed", state } as const;
      await requestResult(stateStore.put(plan.state));
      const retained = new Set(plan.intents.map(readerIntentResourceKey));
      for (const record of relevant) {
        if (!retained.has(record.resourceKey)) await requestResult(outboxStore.delete([input.namespaceKey, record.resourceKey]));
      }
      for (const intent of plan.intents) {
        if (relevant.some((record) => record.intent === intent)) continue;
        await requestResult(outboxStore.put({ namespaceKey: input.namespaceKey, resourceKey: readerIntentResourceKey(intent), schemaVersion: 1, intent } satisfies StoredReaderOutboxIntent));
      }
      return { status: "committed", state: plan.state } as const;
    });
    if (result.status === "committed") publishOfflineReaderOutboxChange(input.namespaceKey);
    return result;
  }
}
