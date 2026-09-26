import type { MarginaliaBookmarkUpsert, MarginaliaHighlightUpsert } from "@secondpass/client";
import type { OfflineReaderAnnotationProjection } from "../../storage/OfflineRepositories.Types";
import type { DeleteReaderAnnotationIntent, UpsertReaderAnnotationIntent } from "../outbox/ReaderOutbox.Policy";
import type { ReaderAnnotationOrigin } from "../outbox/ReaderOutbox.Policy";
import type { CurrentSessionAnnotationMutation } from "../../../../features/reader/session/annotations/CurrentSessionAnnotation.Types";

export type ReaderAnnotationIntent = UpsertReaderAnnotationIntent | DeleteReaderAnnotationIntent;

export function annotationIntentClientId(intent: ReaderAnnotationIntent): string {
  return intent.type === "upsert-annotation" ? intent.annotation.clientId : intent.clientId;
}

export function projectionClientId(projection: OfflineReaderAnnotationProjection): string {
  return projection.status === "present" ? projection.annotation.clientId : projection.clientId;
}

export function sameAnnotation(
  left: MarginaliaBookmarkUpsert | MarginaliaHighlightUpsert,
  right: MarginaliaBookmarkUpsert | MarginaliaHighlightUpsert,
): boolean {
  if (left.clientId !== right.clientId || left.kind !== right.kind
    || left.location.location !== right.location.location || left.location.locationLabel !== right.location.locationLabel) return false;
  if (left.kind === "bookmark" || right.kind === "bookmark") return true;
  return left.body.text === right.body.text && left.body.prefix === right.body.prefix
    && left.body.suffix === right.body.suffix && left.body.note === right.body.note
    && left.body.color === right.body.color;
}

export function projectionMatchesIntent(
  projection: OfflineReaderAnnotationProjection | undefined,
  intent: ReaderAnnotationIntent,
): boolean {
  if (!projection) return false;
  return intent.type === "delete-annotation"
    ? projection.status === "deleted" && projection.clientId === intent.clientId
    : projection.status === "present" && sameAnnotation(projection.annotation, intent.annotation);
}

export function sameProjection(
  left: OfflineReaderAnnotationProjection | undefined,
  right: OfflineReaderAnnotationProjection | undefined,
): boolean {
  if (!left || !right) return left === right;
  if (left.origin.kind !== right.origin.kind) return false;
  if (left.origin.kind === "server-confirmed" && right.origin.kind === "server-confirmed"
    && left.origin.serverSessionId !== right.origin.serverSessionId) return false;
  return left.status === "present"
    ? right.status === "present" && sameAnnotation(left.annotation, right.annotation)
    : right.status === "deleted" && left.clientId === right.clientId;
}

export function applyAnnotationIntent(
  projections: readonly OfflineReaderAnnotationProjection[],
  intent: ReaderAnnotationIntent,
): OfflineReaderAnnotationProjection[] {
  return applyAnnotationMutation(projections, intent.type === "upsert-annotation"
    ? { action: "upsert", annotation: intent.annotation }
    : { action: "delete", clientId: intent.clientId }, intent.origin);
}

export function applyAnnotationMutation(
  projections: readonly OfflineReaderAnnotationProjection[],
  mutation: CurrentSessionAnnotationMutation,
  origin: ReaderAnnotationOrigin,
): OfflineReaderAnnotationProjection[] {
  const clientId = mutation.action === "upsert" ? mutation.annotation.clientId : mutation.clientId;
  const next: OfflineReaderAnnotationProjection | null = mutation.action === "upsert"
    ? { status: "present", origin, annotation: mutation.annotation }
    : origin.kind === "local-unconfirmed" ? null : { status: "deleted", origin, clientId };
  const index = projections.findIndex((item) => projectionClientId(item) === clientId);
  if (index < 0) return next ? [...projections, next] : [...projections];
  return projections.flatMap((item, itemIndex) => itemIndex === index ? next ? [next] : [] : [item]);
}
