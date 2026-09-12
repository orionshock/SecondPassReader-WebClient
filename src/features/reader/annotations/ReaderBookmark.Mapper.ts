import type { MarginaliaAnnotation } from "@secondpass/client";
import type { ReaderAnnotation } from "../domain/ReaderDomain.Types";
import { getAnnotationFragmentCfi, isBookmarkAnnotation } from "./ReaderAnnotationSelectors.Queries";

export type ReaderBookmark = Extract<ReaderAnnotation, { kind: "bookmark" }>;

export function toReaderBookmark(annotation: MarginaliaAnnotation): ReaderBookmark | null {
  if (!isBookmarkAnnotation(annotation)) return null;
  const cfi = getAnnotationFragmentCfi(annotation);
  if (!cfi) return null;
  return { kind: "bookmark", id: annotation.id, cfi };
}
