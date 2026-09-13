import { annotationIntentClientId, projectionClientId, projectionMatchesIntent, sameProjection, applyAnnotationIntent, type ReaderAnnotationIntent } from "../annotations/ReaderAnnotationDesiredState.Policy";
import type {
  MarginaliaAnnotation,
  MarginaliaBookmarkUpsert,
  MarginaliaHighlightUpsert,
} from "@secondpass/client";
import type { OfflineReaderAnnotationProjection } from "../../storage/OfflineRepositories.Types";

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
      || !sameProjection(projection, beforeRequest.get(clientId))
    ) {
      projections.set(clientId, structuredClone(projection));
    }
  }

  return input.pending.reduce((current, intent) => applyAnnotationIntent(current, intent), [...projections.values()]);
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
