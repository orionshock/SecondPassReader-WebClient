import { canWriteLocalReaderState } from "../continuity/OfflineReaderSession.Policy";
import {
  readerIntentResourceKey,
  type ReplaceReaderProgressIntent,
} from "../outbox/ReaderOutbox.Policy";
import type {
  OfflineReaderBookState,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "../../storage/OfflineRepositories.Types";

export type OfflineReadingProgress = ReplaceReaderProgressIntent["progress"];

export type OfflineReaderProgressPersistenceResult =
  | { status: "persisted" }
  | { status: "state-only" }
  | { status: "missing" }
  | { status: "failed" };

export type OfflineReaderProgressPersistence = {
  persist(progress: OfflineReadingProgress): Promise<OfflineReaderProgressPersistenceResult>;
};

export function createOfflineReaderProgressPersistence(input: {
  namespaceKey: string;
  bookId: string;
  stateRepository: OfflineReaderStateRepository;
  outboxRepository: ReaderOutboxRepository;
}): OfflineReaderProgressPersistence {
  const namespaceKey = input.namespaceKey.trim();
  const bookId = input.bookId.trim();
  return {
    persist: (progress) => persistOfflineReaderProgress({ ...input, namespaceKey, bookId, progress }),
  };
}

async function persistOfflineReaderProgress(input: {
  namespaceKey: string;
  bookId: string;
  progress: OfflineReadingProgress;
  stateRepository: OfflineReaderStateRepository;
  outboxRepository: ReaderOutboxRepository;
}): Promise<OfflineReaderProgressPersistenceResult> {
  let committedState: OfflineReaderBookState;
  try {
    const update = await input.stateRepository.updateBookState(
      input.namespaceKey,
      input.bookId,
      (currentState) => {
        if (!canWriteLocalReaderState(currentState.session)) {
          throw new Error("Offline Reader Session is not writable.");
        }
        return { ...currentState, progress: input.progress };
      },
    );
    if (update.status === "missing") return { status: "missing" };
    committedState = update.state;
  } catch {
    return { status: "failed" };
  }

  // Progress state intentionally commits before delivery intent so local resume survives an
  // outbox failure. This protocol is ordered, but the two durability steps are not atomic.
  try {
    const serverSessionId = committedState.session.kind === "server-confirmed"
      ? committedState.session.serverSessionId
      : null;
    const resourceKey = readerIntentResourceKey({
      type: "replace-progress",
      namespaceKey: committedState.namespaceKey,
      bookId: committedState.bookId,
      serverSessionId,
      intentRevision: 0,
      progress: input.progress,
    });
    const intents = await input.outboxRepository.list(committedState.namespaceKey);
    const currentRevision = intents.reduce((revision, intent) => (
      intent.type === "replace-progress" && readerIntentResourceKey(intent) === resourceKey
        ? Math.max(revision, intent.intentRevision)
        : revision
    ), 0);
    await input.outboxRepository.upsertIntent({
      type: "replace-progress",
      namespaceKey: committedState.namespaceKey,
      bookId: committedState.bookId,
      serverSessionId,
      intentRevision: currentRevision + 1,
      progress: input.progress,
    });
    return { status: "persisted" };
  } catch {
    return { status: "state-only" };
  }
}
