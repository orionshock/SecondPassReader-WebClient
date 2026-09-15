import type { LocalReaderAnnotationCommitRepository } from "../annotations/LocalReaderAnnotationCommit.Repository";
import type { ReaderAnnotationIntent } from "../annotations/ReaderAnnotationDesiredState.Policy";
import type {
  OfflineReaderBookState,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "../../storage/OfflineRepositories.Types";

import type { ReaderOutboxIntent } from "../outbox/ReaderOutbox.Policy";
import { sortReaderIntentsForReplay } from "./ReaderReplay.Policy";

export type ReaderAnnotationContinuationOutcome = {
  forwardedConfirmedEdits: number;
  droppedConfirmedDeletes: number;
  continuedLocalUpserts: number;
  fromSessionId: string;
  toSessionId: string;
};

type UpsertIntent = Extract<ReaderAnnotationIntent, { type: "upsert-annotation" }>;
type DeleteIntent = Extract<ReaderAnnotationIntent, { type: "delete-annotation" }>;
type LocalOrigin = { origin: { kind: "local-unconfirmed" } };
type ConfirmedOrigin = { origin: { kind: "server-confirmed"; serverSessionId: string } };
export type ContinuationTransform =
  | { kind: "forward-confirmed"; current: UpsertIntent & ConfirmedOrigin; replacement: UpsertIntent & LocalOrigin }
  | { kind: "continue-local"; current: UpsertIntent & LocalOrigin; replacement: UpsertIntent & LocalOrigin }
  | { kind: "drop-confirmed"; current: DeleteIntent & ConfirmedOrigin; replacement: null }
  | { kind: "drop-local-delete"; current: DeleteIntent & LocalOrigin; replacement: null };

export async function prepareOfflineReaderAnnotationContinuation(input: {
  namespaceKey: string;
  bookId: string;
  toSessionId: string;
  closedSessionId: string | null;
  stateRepository: OfflineReaderStateRepository;
  outboxRepository: ReaderOutboxRepository;
  annotationCommitRepository: LocalReaderAnnotationCommitRepository;
  generateClientId?: () => string;
}): Promise<
  | { status: "prepared"; continuation: ReaderAnnotationContinuationOutcome | null }
  | { status: "no-local-state" | "failed" }
> {
  let state: OfflineReaderBookState | null;
  let intents: ReaderAnnotationIntent[];
  try {
    [state, intents] = await Promise.all([
      input.stateRepository.getBookState(input.namespaceKey, input.bookId),
      input.outboxRepository.list(input.namespaceKey).then((all) => annotationIntents(all, input.bookId)),
    ]);
  } catch {
    return { status: "failed" };
  }
  if (!state) return { status: "no-local-state" };

  const transforms = buildTransforms(input, intents);
  if (transforms.length === 0) return { status: "prepared", continuation: null };
  const applied: ContinuationTransform[] = [];
  try {
    // Projection and intent identity are one continuation invariant. The IndexedDB implementation
    // commits both stores together; exact intent revisions make stale transforms no-ops.
    const committed = await input.annotationCommitRepository.commit({
      namespaceKey: input.namespaceKey,
      bookId: input.bookId,
      kind: "continue",
      targetSessionId: input.toSessionId,
      transforms,
    });
    if (committed.status === "no-local-state") return { status: "no-local-state" };
    if (committed.status === "conflict" || committed.status === "not-writable") return { status: "failed" };
    applied.push(...transforms);
  } catch {
    return { status: "failed" };
  }

  if (applied.length === 0) return { status: "prepared", continuation: null };
  const confirmedSource = applied.find(
    (item): item is ContinuationTransform & { current: ReaderAnnotationIntent & { origin: { kind: "server-confirmed"; serverSessionId: string } } } => (
      item.current.origin.kind === "server-confirmed"
    ),
  );
  return {
    status: "prepared",
    continuation: {
      forwardedConfirmedEdits: applied.filter((item) => item.kind === "forward-confirmed").length,
      droppedConfirmedDeletes: applied.filter((item) => item.kind === "drop-confirmed").length,
      continuedLocalUpserts: applied.filter((item) => item.kind === "continue-local").length,
      fromSessionId: input.closedSessionId ?? confirmedSource?.current.origin.serverSessionId ?? "",
      toSessionId: input.toSessionId,
    },
  };
}

function buildTransforms(
  input: {
    toSessionId: string;
    closedSessionId: string | null;
    generateClientId?: () => string;
  },
  intents: readonly ReaderAnnotationIntent[],
): ContinuationTransform[] {
  const transforms: ContinuationTransform[] = [];
  for (const intent of intents) {
    if (intent.type === "delete-annotation") {
      if (intent.origin.kind === "local-unconfirmed") {
        transforms.push({ current: { ...intent, origin: intent.origin }, replacement: null, kind: "drop-local-delete" });
      } else if (input.closedSessionId || intent.origin.serverSessionId !== input.toSessionId) {
        transforms.push({ current: { ...intent, origin: intent.origin }, replacement: null, kind: "drop-confirmed" });
      }
      continue;
    }

    if (intent.origin.kind === "local-unconfirmed") {
      if (intent.serverSessionId !== input.toSessionId) {
        transforms.push({
          current: { ...intent, origin: intent.origin },
          replacement: {
            ...intent,
            origin: intent.origin,
            serverSessionId: input.toSessionId,
            intentRevision: intent.intentRevision + 1,
          },
          kind: "continue-local",
        });
      }
      continue;
    }
    if (!input.closedSessionId && intent.origin.serverSessionId === input.toSessionId) continue;
    const clientId = generateClientId(input.generateClientId);
    transforms.push({
      current: { ...intent, origin: intent.origin },
      replacement: {
        ...intent,
        serverSessionId: input.toSessionId,
        intentRevision: intent.intentRevision + 1,
        origin: { kind: "local-unconfirmed" },
        annotation: { ...intent.annotation, clientId },
      },
      kind: "forward-confirmed",
    });
  }
  return transforms;
}

function annotationIntents(intents: readonly ReaderOutboxIntent[], bookId: string): ReaderAnnotationIntent[] {
  return sortReaderIntentsForReplay(intents)
    .filter((intent): intent is ReaderAnnotationIntent => (
      intent.bookId === bookId
      && (intent.type === "upsert-annotation" || intent.type === "delete-annotation")
    ));
}

function generateClientId(generator?: () => string): string {
  const value = (generator ?? (() => globalThis.crypto.randomUUID()))().trim();
  if (!value) throw new Error("Annotation client identity is unavailable.");
  return value;
}
