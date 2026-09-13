import {
  OFFLINE_STORE_NAMES,
  requestResult,
  runTransaction,
} from "../../storage/IndexedDbOfflineDatabase.Adapter";
import type { OfflineReaderBookState } from "../../storage/OfflineRepositories.Types";
import {
  readerIntentResourceKey,
  readerIntentRevision,
  withoutReaderIntentAttempt,
} from "../outbox/ReaderOutbox.Policy";
import type { StoredReaderOutboxIntent } from "../outbox/IndexedDbReaderOutbox.Repository";
import { publishOfflineReaderOutboxChange } from "../outbox/OfflineReaderOutboxChange.State";
import {
  continuationProjectionMatchesIntent,
  transformContinuationProjection,
  type ContinuationTransform,
  type ReaderAnnotationContinuationRepository,
} from "./OfflineReaderAnnotationContinuation.Actions";

export class IndexedDbOfflineReaderAnnotationContinuationRepository
implements ReaderAnnotationContinuationRepository {
  constructor(private readonly database: IDBDatabase) {}

  async commit(input: {
    namespaceKey: string;
    bookId: string;
    transforms: readonly ContinuationTransform[];
  }): Promise<{ status: "committed" | "conflict" | "no-local-state" }> {
    const transaction = this.database.transaction(
      [OFFLINE_STORE_NAMES.readerState, OFFLINE_STORE_NAMES.readerOutbox],
      "readwrite",
    );
    const stateStore = transaction.objectStore(OFFLINE_STORE_NAMES.readerState);
    const outboxStore = transaction.objectStore(OFFLINE_STORE_NAMES.readerOutbox);
    const result = await runTransaction(transaction, async () => {
      const state = await requestResult<OfflineReaderBookState | undefined>(
        stateStore.get([input.namespaceKey, input.bookId]),
      );
      if (!state) return { status: "no-local-state" } as const;

      for (const transform of input.transforms) {
        const resourceKey = readerIntentResourceKey(transform.current);
        const stored = await requestResult<StoredReaderOutboxIntent | undefined>(
          outboxStore.get([input.namespaceKey, resourceKey]),
        );
        if (!stored || readerIntentRevision(stored.intent) !== transform.current.intentRevision) {
          return { status: "conflict" } as const;
        }
        const projection = state.annotations.find((item) => (
          item.status === "present"
            ? item.annotation.clientId === annotationClientId(transform)
            : item.clientId === annotationClientId(transform)
        ));
        if (!projection || !continuationProjectionMatchesIntent(projection, transform.current)) {
          return { status: "conflict" } as const;
        }
      }

      await requestResult(stateStore.put({
        ...state,
        annotations: transformContinuationProjection(state.annotations, input.transforms),
      }));
      for (const transform of input.transforms) {
        const resourceKey = readerIntentResourceKey(transform.current);
        if (!transform.replacement) {
          await requestResult(outboxStore.delete([input.namespaceKey, resourceKey]));
          continue;
        }
        const replacementResourceKey = readerIntentResourceKey(transform.replacement);
        await requestResult(outboxStore.put({
          namespaceKey: input.namespaceKey,
          resourceKey: replacementResourceKey,
          schemaVersion: 1,
          intent: withoutReaderIntentAttempt(transform.replacement),
        } satisfies StoredReaderOutboxIntent));
        if (replacementResourceKey !== resourceKey) {
          await requestResult(outboxStore.delete([input.namespaceKey, resourceKey]));
        }
      }
      return { status: "committed" } as const;
    });
    if (result.status === "committed") publishOfflineReaderOutboxChange(input.namespaceKey);
    return result;
  }
}

function annotationClientId(transform: ContinuationTransform): string {
  return transform.current.type === "upsert-annotation"
    ? transform.current.annotation.clientId
    : transform.current.clientId;
}
