import type {
  MarginaliaAnnotation,
  MarginaliaBookmarkUpsert,
  MarginaliaHighlightUpsert,
} from "@secondpass/client";
import type { OfflineReaderAnnotationProjection } from "../../storage/OfflineRepositories.Types";
import type {
  DeleteReaderAnnotationIntent,
  UpsertReaderAnnotationIntent,
} from "../outbox/ReaderOutbox.Policy";

export type ReaderAnnotationIntent = UpsertReaderAnnotationIntent | DeleteReaderAnnotationIntent;

export function mergeAuthoritativeReaderAnnotations(input: {
  authoritative: readonly MarginaliaAnnotation[];
  serverSessionId: string;
  beforeRequest: readonly OfflineReaderAnnotationProjection[];
  current: readonly OfflineReaderAnnotationProjection[];
  delivered: readonly ReaderAnnotationIntent[];
  pending: readonly ReaderAnnotationIntent[];
}): OfflineReaderAnnotationProjection[] {
  const projections = new Map<string, OfflineReaderAnnotationProjection>();
  for (const annotation of input.authoritative) {
    projections.set(annotation.clientId, {
      status: "present",
      origin: { kind: "server-confirmed", serverSessionId: input.serverSessionId },
      annotation: toAnnotationUpsert(annotation),
    });
  }

  const delivered = new Map(input.delivered.map((intent) => [annotationIntentClientId(intent), intent]));
  const beforeRequest = new Map(input.beforeRequest.map((projection) => [projectionClientId(projection), projection]));
  for (const projection of input.current) {
    const clientId = projectionClientId(projection);
    const deliveredIntent = delivered.get(clientId);
    if (deliveredIntent && projectionMatchesIntent(projection, deliveredIntent)) continue;
    if (
      projection.origin.kind === "local-unconfirmed"
      || !sameValue(projection, beforeRequest.get(clientId))
    ) {
      projections.set(clientId, structuredClone(projection));
    }
  }

  for (const intent of input.pending) applyIntent(projections, intent);
  return [...projections.values()];
}

export function toAnnotationUpsert(
  annotation: MarginaliaAnnotation,
): MarginaliaHighlightUpsert | MarginaliaBookmarkUpsert {
  if (annotation.kind === "bookmark") {
    return {
      clientId: annotation.clientId,
      kind: "bookmark",
      location: { ...annotation.location },
    };
  }
  return {
    clientId: annotation.clientId,
    kind: "highlight",
    location: { ...annotation.location },
    body: { ...annotation.body },
  };
}

export function annotationIntentClientId(intent: ReaderAnnotationIntent): string {
  return intent.type === "upsert-annotation" ? intent.annotation.clientId : intent.clientId;
}

function applyIntent(
  projections: Map<string, OfflineReaderAnnotationProjection>,
  intent: ReaderAnnotationIntent,
): void {
  const clientId = annotationIntentClientId(intent);
  if (intent.type === "upsert-annotation") {
    projections.set(clientId, {
      status: "present",
      origin: intent.origin,
      annotation: structuredClone(intent.annotation),
    });
    return;
  }
  projections.set(clientId, { status: "deleted", origin: intent.origin, clientId });
}

function projectionMatchesIntent(
  projection: OfflineReaderAnnotationProjection,
  intent: ReaderAnnotationIntent,
): boolean {
  if (projection.status === "deleted") {
    return intent.type === "delete-annotation" && projection.clientId === intent.clientId;
  }
  return intent.type === "upsert-annotation" && sameValue(projection.annotation, intent.annotation);
}

function projectionClientId(projection: OfflineReaderAnnotationProjection): string {
  return projection.status === "present" ? projection.annotation.clientId : projection.clientId;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
