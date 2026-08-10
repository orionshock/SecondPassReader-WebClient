import type { MarginaliaAnnotation } from "@secondpass/client";
import type { ReaderAnnotation } from "../domain/ReaderDomain.Types";
import { getAnnotationFragmentCfi, isBookmarkAnnotation, isHighlightAnnotation } from "./ReaderAnnotationSelectors.Queries";
import { getAnnotationDescribingText } from "../display/ReaderAnnotation.Presenter";

export { getAnnotationFragmentCfi, isBookmarkAnnotation, isHighlightAnnotation } from "./ReaderAnnotationSelectors.Queries";

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
