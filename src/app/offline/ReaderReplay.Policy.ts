import {
  readerIntentResourceKey,
  type ReaderOutboxIntent,
} from "./ReaderOutbox.Policy";

export type ReaderReplayGroup = {
  namespaceKey: string;
  bookId: string;
  intents: ReaderOutboxIntent[];
};

export function readerReplayPriority(intent: ReaderOutboxIntent): number {
  switch (intent.type) {
    case "establish-session":
      return 0;
    case "upsert-annotation":
    case "delete-annotation":
      return 1;
    case "replace-progress":
      return 2;
    default:
      return rejectUnsupportedIntent(intent);
  }
}

export function sortReaderIntentsForReplay(
  intents: readonly ReaderOutboxIntent[],
): ReaderOutboxIntent[] {
  return [...intents].sort((left, right) => {
    const priorityDifference = readerReplayPriority(left) - readerReplayPriority(right);
    if (priorityDifference !== 0) return priorityDifference;

    const resourceDifference = compareText(readerIntentResourceKey(left), readerIntentResourceKey(right));
    if (resourceDifference !== 0) return resourceDifference;

    return (readerIntentRevision(left) ?? -1) - (readerIntentRevision(right) ?? -1);
  });
}

export function groupReaderIntentsForReplay(
  intents: readonly ReaderOutboxIntent[],
): ReaderReplayGroup[] {
  const groups = new Map<string, ReaderReplayGroup>();
  for (const intent of intents) {
    const key = JSON.stringify([intent.namespaceKey, intent.bookId]);
    const group = groups.get(key);
    if (group) group.intents.push(intent);
    else groups.set(key, {
      namespaceKey: intent.namespaceKey,
      bookId: intent.bookId,
      intents: [intent],
    });
  }

  return [...groups.values()]
    .sort((left, right) => compareText(replayGroupKey(left), replayGroupKey(right)))
    .map((group) => ({ ...group, intents: sortReaderIntentsForReplay(group.intents) }));
}

export function canAcknowledgeReaderIntent(
  current: ReaderOutboxIntent,
  deliveredRevision: number | null,
): boolean {
  return readerIntentRevision(current) === deliveredRevision;
}

function readerIntentRevision(intent: ReaderOutboxIntent): number | null {
  return "intentRevision" in intent ? intent.intentRevision : null;
}

function replayGroupKey(group: Pick<ReaderReplayGroup, "namespaceKey" | "bookId">): string {
  return JSON.stringify([group.namespaceKey, group.bookId]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function rejectUnsupportedIntent(intent: never): never {
  throw new Error(`Unsupported Reader replay intent: ${String((intent as { type?: unknown }).type ?? "unknown")}`);
}
