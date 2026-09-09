import type { ReaderOutboxRepository } from "./OfflineRepositories.Types";
import { readerIntentResourceKey, type ReplaceReaderProgressIntent } from "./ReaderOutbox.Policy";

export async function discardPendingReaderProgress(input: {
  namespaceKey: string;
  bookId: string;
  outboxRepository: ReaderOutboxRepository;
}): Promise<{ removed: number }> {
  const intents = await input.outboxRepository.list(input.namespaceKey);
  const progressIntents = intents.filter(
    (intent): intent is ReplaceReaderProgressIntent => (
      intent.bookId === input.bookId && intent.type === "replace-progress"
    ),
  );
  let removed = 0;
  for (const intent of progressIntents) {
    if (await input.outboxRepository.remove(
      input.namespaceKey,
      readerIntentResourceKey(intent),
      intent.intentRevision,
    )) removed += 1;
  }
  return { removed };
}
