import type { MarginaliaAnnotation } from "@secondpass/client";
import type { ReaderAnnotation } from "../domain/types";
import { getAnnotationFragmentCfi, isBookmarkAnnotation, isHighlightAnnotation } from "./annotationSelectors";

export { getAnnotationFragmentCfi, isBookmarkAnnotation, isHighlightAnnotation } from "./annotationSelectors";

export function getAnnotationDescribingText(annotation: MarginaliaAnnotation): string | null { return annotation.kind === "highlight" ? annotation.body.text : null; }

export function getAnnotationNoteText(annotation: MarginaliaAnnotation): string | null { return annotation.kind === "highlight" ? annotation.body.note || null : null; }

export function getAnnotationColor(annotation: MarginaliaAnnotation): string | null { return annotation.kind === "highlight" ? annotation.body.color : null; }

export function getAnnotationTimestamp(annotation: MarginaliaAnnotation): string | null { return annotation.updatedAt || annotation.createdAt || null; }

export function toReaderAnnotation(annotation: MarginaliaAnnotation): ReaderAnnotation | null {
  if (isBookmarkAnnotation(annotation)) {
    const cfi = getAnnotationFragmentCfi(annotation);
    if (!cfi) return null;
    return { kind: "bookmark", id: annotation.id, cfi };
  }
  if (isHighlightAnnotation(annotation)) {
    const cfiRange = getAnnotationFragmentCfi(annotation);
    if (!cfiRange) return null;
    const text = getAnnotationDescribingText(annotation) ?? undefined;
    return { kind: "highlight", id: annotation.id, cfiRange, text };
  }
  return null;
}
