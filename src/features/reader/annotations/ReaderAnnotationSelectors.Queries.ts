import type { MarginaliaAnnotation } from "@secondpass/client";

export function isBookmarkAnnotation(annotation: MarginaliaAnnotation): boolean { return annotation.kind === "bookmark"; }

export function isHighlightAnnotation(annotation: MarginaliaAnnotation): boolean { return annotation.kind === "highlight"; }
export function isCommentAnnotation(annotation: MarginaliaAnnotation): boolean { return annotation.kind === "highlight" && Boolean(annotation.body.note); }

export function getAnnotationFragmentCfi(annotation: MarginaliaAnnotation): string | null { return annotation.location.cfi || null; }

export function getAnnotationDescribingText(annotation: MarginaliaAnnotation): string | null {
  return annotation.kind === "highlight" ? annotation.body.text : null;
}

export function getAnnotationNoteText(annotation: MarginaliaAnnotation): string | null {
  return annotation.kind === "highlight" ? annotation.body.note || null : null;
}

export function getAnnotationColor(annotation: MarginaliaAnnotation): string | null {
  return annotation.kind === "highlight" ? annotation.body.color : null;
}

export function getAnnotationTimestamp(annotation: MarginaliaAnnotation): string | null {
  return annotation.updatedAt || annotation.createdAt || null;
}

export function findReaderBookmarkAtCfi<T extends { cfi: string }>(
  bookmarks: readonly T[],
  currentCfi: string | null | undefined,
): T | null {
  const cfi = currentCfi?.trim() ?? "";
  if (!cfi) return null;
  return bookmarks.find((bookmark) => bookmark.cfi === cfi) ?? null;
}
