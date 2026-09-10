import type {
  OfflineReaderBookState,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "../../storage/OfflineRepositories.Types";
import { annotationIntentClientId, type ReaderAnnotationIntent } from "./OfflineReaderAnnotationReplay.State";
import { updateOfflineReaderBookState } from "../continuity/OfflineReaderStateWrite.Coordinator";
import { readerIntentResourceKey, type ReaderOutboxIntent } from "../outbox/ReaderOutbox.Policy";
import { sortReaderIntentsForReplay } from "./ReaderReplay.Policy";

export type ReaderAnnotationContinuationOutcome = {
  forwardedConfirmedEdits: number;
  droppedConfirmedDeletes: number;
  continuedLocalUpserts: number;
  fromSessionId: string;
  toSessionId: string;
};

type ContinuationTransform = {
  current: ReaderAnnotationIntent;
  replacement: ReaderAnnotationIntent | null;
  kind: "forward-confirmed" | "drop-confirmed" | "continue-local" | "drop-local-delete";
};

export async function prepareOfflineReaderAnnotationContinuation(input: {
  namespaceKey: string;
  bookId: string;
  toSessionId: string;
  closedSessionId: string | null;
  stateRepository: OfflineReaderStateRepository;
  outboxRepository: ReaderOutboxRepository;
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
    await updateOfflineReaderBookState({
      namespaceKey: input.namespaceKey,
      bookId: input.bookId,
      fallbackState: state,
      repository: input.stateRepository,
      update: (current) => ({ ...current, annotations: transformProjection(current.annotations, transforms) }),
    });
    for (const transform of transforms) {
      const key = readerIntentResourceKey(transform.current);
      const changed = transform.replacement
        ? await input.outboxRepository.replace(
          input.namespaceKey,
          key,
          transform.current.intentRevision,
          transform.replacement,
        )
        : await input.outboxRepository.remove(input.namespaceKey, key, transform.current.intentRevision);
      if (changed) applied.push(transform);
    }
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
        transforms.push({ current: intent, replacement: null, kind: "drop-local-delete" });
      } else if (input.closedSessionId || intent.origin.serverSessionId !== input.toSessionId) {
        transforms.push({ current: intent, replacement: null, kind: "drop-confirmed" });
      }
      continue;
    }

    if (intent.origin.kind === "local-unconfirmed") {
      if (intent.serverSessionId !== input.toSessionId) {
        transforms.push({
          current: intent,
          replacement: {
            ...intent,
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
      current: intent,
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

function transformProjection(
  projections: OfflineReaderBookState["annotations"],
  transforms: readonly ContinuationTransform[],
) {
  const next = [...projections];
  for (const transform of transforms) {
    const clientId = annotationIntentClientId(transform.current);
    const index = next.findIndex((item) => (
      item.status === "present" ? item.annotation.clientId === clientId : item.clientId === clientId
    ));
    if (transform.kind === "forward-confirmed" && transform.replacement?.type === "upsert-annotation") {
      if (index >= 0 && projectionMatchesIntent(next[index], transform.current)) {
        next[index] = {
          status: "present",
          origin: { kind: "local-unconfirmed" },
          annotation: structuredClone(transform.replacement.annotation),
        };
      }
    } else if (transform.kind === "drop-confirmed" || transform.kind === "drop-local-delete") {
      if (index >= 0 && projectionMatchesIntent(next[index], transform.current)) next.splice(index, 1);
    }
  }
  return next;
}

function projectionMatchesIntent(
  projection: OfflineReaderBookState["annotations"][number],
  intent: ReaderAnnotationIntent,
): boolean {
  if (intent.type === "delete-annotation") {
    return projection.status === "deleted" && projection.clientId === intent.clientId;
  }
  return projection.status === "present"
    && JSON.stringify(projection.annotation) === JSON.stringify(intent.annotation);
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
