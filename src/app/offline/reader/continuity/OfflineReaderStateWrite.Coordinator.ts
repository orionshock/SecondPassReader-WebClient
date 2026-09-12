import type {
  OfflineReaderBookState,
  OfflineReaderStateRepository,
} from "../../storage/OfflineRepositories.Types";

type StateUpdate = (current: OfflineReaderBookState) => OfflineReaderBookState;

const activeWrites = new Map<string, Promise<OfflineReaderBookState>>();

// Progress and annotation owners update one shared Book record. Serialize by namespace+Book
// so each update reads the latest durable state instead of overwriting a sibling write.
export function updateOfflineReaderBookState(input: {
  namespaceKey: string;
  bookId: string;
  fallbackState: OfflineReaderBookState;
  repository: OfflineReaderStateRepository;
  update: StateUpdate;
}): Promise<OfflineReaderBookState> {
  const scopeKey = JSON.stringify([input.namespaceKey, input.bookId]);
  const previous = activeWrites.get(scopeKey);
  const operation = (previous?.catch(() => input.fallbackState) ?? Promise.resolve(input.fallbackState))
    .then(async () => {
      const current = await input.repository.getBookState(input.namespaceKey, input.bookId)
        ?? input.fallbackState;
      const next = input.update(current);
      await input.repository.putBookState(next);
      return next;
    });
  activeWrites.set(scopeKey, operation);
  const clear = () => {
    if (activeWrites.get(scopeKey) === operation) activeWrites.delete(scopeKey);
  };
  void operation.then(clear, clear);
  return operation;
}
