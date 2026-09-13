import type { OfflineReaderBookState } from "../../storage/OfflineRepositories.Types";
import { canWriteLocalReaderState } from "../continuity/OfflineReaderSession.Policy";
import { coalesceReaderIntent, readerIntentResourceKey, readerIntentRevision, type ReaderOutboxIntent } from "../outbox/ReaderOutbox.Policy";
import { annotationIntentClientId, applyAnnotationIntent, projectionClientId, projectionMatchesIntent, sameProjection, type ReaderAnnotationIntent } from "./ReaderAnnotationDesiredState.Policy";
import type { LocalReaderAnnotationCommit, LocalReaderAnnotationCommitResult } from "./LocalReaderAnnotationCommit.Repository";

type CommitPlan = Exclude<LocalReaderAnnotationCommitResult, { status: "committed" }> | {
  status: "committed";
  state: OfflineReaderBookState;
  intents: ReaderOutboxIntent[];
};

// Both real storage and test storage use this policy; neither interprets annotation mutations.
export function planLocalReaderAnnotationCommit(
  state: OfflineReaderBookState | undefined,
  intents: readonly ReaderOutboxIntent[],
  input: LocalReaderAnnotationCommit,
): CommitPlan {
  if (!state) return { status: "no-local-state" };
  if (!input.namespaceKey || !input.bookId || state.namespaceKey !== input.namespaceKey || state.bookId !== input.bookId) {
    return { status: "conflict" };
  }
  if (input.kind === "continue") return planContinuation(state, intents, input);
  const authority = input.authority;
  if (!canWriteLocalReaderState(state.session) || !canWriteLocalReaderState(authority)
    || state.session.kind !== authority.kind || state.session.localSessionId !== authority.localSessionId
    || state.session.serverSessionId !== authority.serverSessionId) return { status: "not-writable" };
  const clientId = input.mutation.action === "upsert" ? input.mutation.annotation.clientId : input.mutation.clientId;
  if (!clientId.trim()) return { status: "conflict" };
  const projection = state.annotations.find((item) => projectionClientId(item) === clientId);
  const origin = projection?.origin ?? { kind: "local-unconfirmed" as const };
  if (origin.kind === "server-confirmed" && origin.serverSessionId !== authority.serverSessionId) {
    return { status: "not-writable" };
  }
  const scope = { namespaceKey: input.namespaceKey, bookId: input.bookId, serverSessionId: authority.serverSessionId, origin };
  const revision = state.annotationRevision;
  const intent: ReaderAnnotationIntent = input.mutation.action === "upsert"
    ? { ...scope, type: "upsert-annotation", annotation: input.mutation.annotation, intentRevision: revision + 1 }
    : { ...scope, type: "delete-annotation", clientId, intentRevision: revision + 1 };
  const existing = intents.find((item) => readerIntentResourceKey(item) === readerIntentResourceKey(intent));
  if (revision !== input.expectedRevision || !sameProjection(projection, input.expectedProjection)) {
    // Retrying a lost completion with the same client identity never creates a second annotation.
    // A stale request already satisfied by durable desired state is a no-op, not a new revision.
    if (existing && (existing.type === "upsert-annotation" || existing.type === "delete-annotation")
      && projectionMatchesIntent(projection, intent) && projectionMatchesIntent(projection, existing)) {
      return { status: "committed", state, intents: [...intents] };
    }
    return { status: "conflict" };
  }
  intent.intentRevision = Math.max(revision, existing ? readerIntentRevision(existing) ?? 0 : 0) + 1;
  return {
    status: "committed",
    state: { ...state, annotationRevision: intent.intentRevision, annotations: applyAnnotationIntent(state.annotations, intent) },
    intents: coalesceReaderIntent(intents, intent),
  };
}

function planContinuation(
  state: OfflineReaderBookState,
  intents: readonly ReaderOutboxIntent[],
  input: Extract<LocalReaderAnnotationCommit, { kind: "continue" }>,
): CommitPlan {
  if (!canWriteLocalReaderState(state.session) || state.session.serverSessionId !== input.targetSessionId) {
    return { status: "not-writable" };
  }
  for (const transform of input.transforms) {
    if (transform.current.namespaceKey !== input.namespaceKey || transform.current.bookId !== input.bookId) return { status: "conflict" };
    const existing = intents.find((item) => readerIntentResourceKey(item) === readerIntentResourceKey(transform.current));
    const projection = state.annotations.find((item) => projectionClientId(item) === annotationIntentClientId(transform.current));
    if (!existing || readerIntentRevision(existing) !== transform.current.intentRevision
      || !projectionMatchesIntent(projection, transform.current)) return { status: "conflict" };
    if (transform.replacement) {
      const replacement = transform.replacement;
      if (replacement.namespaceKey !== input.namespaceKey || replacement.bookId !== input.bookId
        || replacement.serverSessionId !== input.targetSessionId) return { status: "conflict" };
      const replacementKey = readerIntentResourceKey(replacement);
      if (replacementKey !== readerIntentResourceKey(transform.current)
        && intents.some((item) => readerIntentResourceKey(item) === replacementKey)) return { status: "conflict" };
      if (annotationIntentClientId(replacement) !== annotationIntentClientId(transform.current)
        && state.annotations.some((item) => projectionClientId(item) === annotationIntentClientId(replacement))) return { status: "conflict" };
    }
  }
  let annotations = state.annotations;
  let nextIntents = [...intents];
  for (const transform of input.transforms) {
    const replacement = transform.replacement ? applyAnnotationIntent([], transform.replacement) : [];
    annotations = annotations.flatMap((item) => projectionClientId(item) === annotationIntentClientId(transform.current)
      ? replacement : [item]);
    nextIntents = nextIntents.filter((item) => readerIntentResourceKey(item) !== readerIntentResourceKey(transform.current));
    if (transform.replacement) {
      nextIntents = coalesceReaderIntent(nextIntents, transform.replacement);
    }
  }
  return {
    status: "committed",
    state: { ...state, annotations, annotationRevision: state.annotationRevision + 1 },
    intents: nextIntents,
  };
}
