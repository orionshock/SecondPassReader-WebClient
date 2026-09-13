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
  const selected = selectOfflineReaderSession({
    existingSession: existing?.session,
    generateLocalId: input.generateLocalId,
  });
  const state = selected.source === "created-provisional"
    ? {
        namespaceKey,
        bookId,
        schemaVersion: 1,
        session: selected.session,
        progress: existing?.progress ?? null,
        annotations: existing?.annotations ?? [],
        annotationRevision: existing ? existing.annotationRevision : 0,
      }
    : existing!;

  if (selected.source === "created-provisional") {
    await input.stateRepository.putBookState(state);
  }
  if (isProvisionalReaderSession(selected.session)) {
    await input.outboxRepository.upsertIntent({
      type: "establish-session",
      namespaceKey,
      bookId,
    });
  }

  return { state, selection: selected.source };
}
