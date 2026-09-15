import type {
  OfflineReaderBookState,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "../../storage/OfflineRepositories.Types";
import {
  isProvisionalReaderSession,
  selectOfflineReaderSession,
  type OfflineReaderSessionSelection,
} from "./OfflineReaderSession.Policy";

export type OfflineReaderContinuityResult = {
  state: OfflineReaderBookState;
  selection: OfflineReaderSessionSelection["source"];
};

type OfflineReaderContinuityInput = {
  namespaceKey: string;
  bookId: string;
  stateRepository: OfflineReaderStateRepository;
  outboxRepository: ReaderOutboxRepository;
  generateLocalId?: () => string;
};

const activeLoads = new Map<string, Promise<OfflineReaderContinuityResult>>();

export async function loadOrCreateOfflineReaderContinuity(
  input: OfflineReaderContinuityInput,
): Promise<OfflineReaderContinuityResult> {
  const namespaceKey = input.namespaceKey.trim();
  const bookId = input.bookId.trim();
  if (!namespaceKey || !bookId) throw new Error("Offline Reader continuity requires account and Book identity.");

  const scopeKey = JSON.stringify([namespaceKey, bookId]);
  const active = activeLoads.get(scopeKey);
  if (active) return active;

  const operation = loadOrCreate({ ...input, namespaceKey, bookId });
  activeLoads.set(scopeKey, operation);
  try {
    return await operation;
  } finally {
    if (activeLoads.get(scopeKey) === operation) activeLoads.delete(scopeKey);
  }
}

async function loadOrCreate(input: OfflineReaderContinuityInput): Promise<OfflineReaderContinuityResult> {
  const { namespaceKey, bookId } = input;
  const existing = await input.stateRepository.getBookState(namespaceKey, bookId);
  if (!existing) return createContinuity(input);

  const selected = selectOfflineReaderSession({
    existingSession: existing.session,
    generateLocalId: input.generateLocalId,
  });
  let state = existing;
  let selection = selected.source;
  if (selected.source === "created-provisional") {
    let currentSelection = selected;
    const update = await input.stateRepository.updateBookState(namespaceKey, bookId, (current) => {
      currentSelection = selectOfflineReaderSession({
        existingSession: current.session,
        generateLocalId: input.generateLocalId,
      });
      return currentSelection.source === "created-provisional"
        ? { ...current, session: currentSelection.session }
        : current;
    });
    if (update.status === "missing") return createContinuity(input);
    state = update.state;
    selection = currentSelection.source;
  }
  if (isProvisionalReaderSession(state.session)) {
    await input.outboxRepository.upsertIntent({
      type: "establish-session",
      namespaceKey,
      bookId,
    });
  }

  return { state, selection };
}

async function createContinuity(
  input: OfflineReaderContinuityInput,
): Promise<OfflineReaderContinuityResult> {
  const selected = selectOfflineReaderSession({ generateLocalId: input.generateLocalId });
  const state: OfflineReaderBookState = {
    namespaceKey: input.namespaceKey,
    bookId: input.bookId,
    schemaVersion: 1,
    session: selected.session,
    progress: null,
    annotations: [],
    annotationRevision: 0,
  };
  await input.stateRepository.putBookState(state);
  await input.outboxRepository.upsertIntent({
    type: "establish-session",
    namespaceKey: input.namespaceKey,
    bookId: input.bookId,
  });
  return { state, selection: selected.source };
}
